import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AccessStore } from './access';
import { createEndSessionUrl, type ZitadelOidcConfig, validateLogoutConfig } from './oidc';

export const AUTH_BROWSER_COOKIE = 'autokosova_auth';
const LOGOUT_COOKIE = 'autokosova_logout';
const ttl = 5 * 60 * 1000;
const localeOf = (value: unknown): 'de' | 'sq' | 'en' =>
  value === 'sq' || value === 'en' ? value : 'de';
const homeOf = (locale: string) => (locale === 'de' ? '/' : '/' + locale);

interface LogoutTransaction {
  readonly state: string;
  readonly locale: string;
  readonly expiresAt: number;
  idTokenHint?: string;
  sent: boolean;
}

/** Browser-bound, one-use handoff. The token is discarded immediately after provider navigation starts. */
export class OidcLogoutTransactions {
  private readonly pending = new Map<string, LogoutTransaction>();
  constructor(private readonly now = () => Date.now()) {}

  pruneExpired(): void {
    for (const [key, value] of this.pending)
      if (value.expiresAt <= this.now()) this.pending.delete(key);
  }

  begin(locale: string, idTokenHint: string) {
    this.pruneExpired();
    if (!idTokenHint) return undefined;
    if (this.pending.size >= 1000) return undefined;
    const binding = randomBytes(32).toString('base64url');
    this.pending.set(binding, {
      state: randomBytes(32).toString('base64url'),
      locale,
      expiresAt: this.now() + ttl,
      idTokenHint,
      sent: false,
    });
    return binding;
  }

  handoff(binding: string | undefined): LogoutTransaction | undefined {
    const transaction = binding ? this.pending.get(binding) : undefined;
    if (!transaction || transaction.sent) return undefined;
    if (transaction.expiresAt <= this.now()) {
      this.pending.delete(binding!);
      return undefined;
    }
    transaction.sent = true;
    const handoff = { ...transaction };
    delete transaction.idTokenHint;
    return handoff;
  }

  complete(binding: string | undefined, state: unknown): LogoutTransaction | undefined {
    const transaction = binding ? this.pending.get(binding) : undefined;
    if (!transaction?.sent || transaction.state !== state) return undefined;
    if (transaction.expiresAt <= this.now()) {
      this.pending.delete(binding!);
      return undefined;
    }
    this.pending.delete(binding!);
    return transaction;
  }

  cancel(binding: string | undefined): void {
    if (binding) this.pending.delete(binding);
  }
  clear(): void {
    this.pending.clear();
  }
}

export function registerOidcLogout(
  app: FastifyInstance,
  store: AccessStore,
  config?: ZitadelOidcConfig,
) {
  if (config?.endSessionEndpoint || config?.postLogoutRedirectUri)
    validateLogoutConfig(config, process.env['NODE_ENV'] === 'production');
  const transactions = new OidcLogoutTransactions();
  const cookieOptions = {
    httpOnly: true,
    path: '/auth',
    sameSite: 'lax' as const,
    secure: process.env['NODE_ENV'] === 'production',
  };
  // Sweep even when an expired session/handoff is never visited again. Do not keep
  // the process alive for cleanup, and release retained token material on shutdown.
  const cleanup = setInterval(() => {
    store.pruneExpiredSessions();
    transactions.pruneExpired();
  }, 60_000);
  cleanup.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    transactions.clear();
    store.clearLogoutIdTokens();
  });
  // An old logout callback must not interrupt a newly started authentication.
  app.addHook('onRequest', async (request) => {
    if (request.url.split('?', 1)[0] === '/auth/login')
      transactions.cancel(request.cookies[LOGOUT_COOKIE]);
  });
  app.post('/auth/logout', async (request, reply) => {
    const principal = store.getPrincipal(request.cookies['autokosova_session']);
    const csrf = request.cookies['autokosova_csrf'];
    // An expired session can still clear local cookies using double-submit CSRF, but
    // cannot target a provider session. Live sessions also bind CSRF to the principal.
    if (
      !csrf ||
      request.headers['x-csrf-token'] !== csrf ||
      (principal && principal.csrfToken !== csrf)
    )
      return reply.code(principal ? 403 : 401).send({ error: 'Logout authorization required' });
    const sessionId = request.cookies['autokosova_session'];
    // Capture only the callback-verified token of this exact live session before local revocation.
    const idTokenHint = principal ? store.getLogoutIdToken(sessionId) : undefined;
    store.revokeSession(sessionId);
    store.revokeOidcTransactions(request.cookies[AUTH_BROWSER_COOKIE]);
    transactions.cancel(request.cookies[LOGOUT_COOKIE]);
    reply.clearCookie('autokosova_session', { path: '/' });
    reply.clearCookie('autokosova_csrf', { path: '/' });
    reply.clearCookie(AUTH_BROWSER_COOKIE, cookieOptions);
    reply.clearCookie(LOGOUT_COOKIE, cookieOptions);
    // Preserve the local-only 204 contract for API clients; the browser explicitly negotiates
    // the navigation response. Never redirect fetch() to the provider (CORS / missing cookies).
    if (!request.headers.accept?.includes('application/json')) return reply.code(204).send();
    const locale = localeOf((request.query as { locale?: unknown }).locale);
    const binding =
      config?.endSessionEndpoint && config.postLogoutRedirectUri && idTokenHint
        ? transactions.begin(locale, idTokenHint)
        : undefined;
    if (!binding) return { redirectTo: `/auth/logged-out?locale=${locale}` };
    reply.setCookie(LOGOUT_COOKIE, binding, { ...cookieOptions, maxAge: ttl / 1000 });
    return { redirectTo: '/auth/logout/provider' };
  });

  app.get('/auth/logout/provider', async (request, reply) => {
    const transaction = transactions.handoff(request.cookies[LOGOUT_COOKIE]);
    if (!transaction || !config)
      return reply.code(400).send({ error: 'Logout handoff invalid or expired' });
    if (!transaction.idTokenHint)
      return reply.code(400).send({ error: 'Logout handoff has no verified session context' });
    return reply.redirect(
      createEndSessionUrl(config, transaction.state, transaction.locale, transaction.idTokenHint),
    );
  });

  app.get('/auth/logout/callback', async (request, reply) => {
    const transaction = transactions.complete(
      request.cookies[LOGOUT_COOKIE],
      (request.query as { state?: unknown }).state,
    );
    if (!transaction) return reply.code(400).send({ error: 'Logout return invalid or expired' });
    // Do not touch app session cookies here: a concurrent new login must survive a late return.
    reply.clearCookie(LOGOUT_COOKIE, cookieOptions);
    return reply.redirect(homeOf(transaction.locale));
  });

  app.get('/auth/logged-out', async (request, reply) => {
    const locale = localeOf((request.query as { locale?: unknown }).locale);
    const text = localLogoutCopy[locale];
    reply.header(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    return reply
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${text.title} · AutoKosova</title><style>body{margin:0;background:#f4f8fe;color:#152b4f;font:18px/1.6 system-ui}main{max-width:38rem;margin:10vh auto;padding:2rem}h1{line-height:1.2}a{display:inline-block;padding:12px 18px;margin:8px 8px 0 0;color:#134da5;border:1px solid;border-radius:10px}a:focus-visible{outline:3px solid;outline-offset:4px}</style></head><body><main><p>AutoKosova</p><h1>${text.title}</h1><p>${text.body}</p><a href="${homeOf(locale)}">${text.home}</a><a href="/auth/login?returnTo=${encodeURIComponent(locale === 'de' ? '/profile' : `/${locale}/profile`)}">${text.login}</a></main></body></html>`,
      );
  });
}

const localLogoutCopy = {
  de: {
    title: 'Bei AutoKosova abgemeldet',
    body: 'Die lokale Sitzung ist beendet. Die gezielte Abmeldung beim Anmeldeanbieter ist nicht konfiguriert oder der Sitzung fehlt der erforderliche Logout-Kontext. Beim nächsten Login wird eine erneute Authentifizierung angefordert.',
    home: 'Zur Startseite',
    login: 'Erneut anmelden',
  },
  sq: {
    title: 'Keni dalë nga AutoKosova',
    body: 'Sesioni lokal ka përfunduar. Dalja e synuar nga ofruesi i identitetit nuk është konfiguruar ose këtij sesioni i mungon konteksti i nevojshëm. Hyrja tjetër do të kërkojë autentikim të ri.',
    home: 'Faqja kryesore',
    login: 'Hyni përsëri',
  },
  en: {
    title: 'Signed out of AutoKosova',
    body: 'Your local session has ended. Targeted identity-provider logout is not configured or this session lacks the required logout context. Your next sign-in will request fresh authentication.',
    home: 'Back to home',
    login: 'Sign in again',
  },
};
