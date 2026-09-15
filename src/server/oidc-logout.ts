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
  sent: boolean;
}

/** Browser-bound, one-use handoff and callback. Contains no identity or OIDC token. */
export class OidcLogoutTransactions {
  private readonly pending = new Map<string, LogoutTransaction>();
  constructor(private readonly now = () => Date.now()) {}

  begin(locale: string) {
    for (const [key, value] of this.pending)
      if (value.expiresAt <= this.now()) this.pending.delete(key);
    if (this.pending.size >= 1000) return undefined;
    const binding = randomBytes(32).toString('base64url');
    this.pending.set(binding, {
      state: randomBytes(32).toString('base64url'),
      locale,
      expiresAt: this.now() + ttl,
      sent: false,
    });
    return binding;
  }

  handoff(binding: string | undefined): LogoutTransaction | undefined {
    const transaction = binding ? this.pending.get(binding) : undefined;
    if (!transaction || transaction.sent || transaction.expiresAt <= this.now()) return undefined;
    transaction.sent = true;
    return transaction;
  }

  complete(binding: string | undefined, state: unknown): LogoutTransaction | undefined {
    const transaction = binding ? this.pending.get(binding) : undefined;
    if (!transaction?.sent || transaction.state !== state || transaction.expiresAt <= this.now())
      return undefined;
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
  app.addHook('onClose', async () => transactions.clear());
  // An old logout callback must not interrupt a newly started authentication.
  app.addHook('onRequest', async (request) => {
    if (request.url.split('?', 1)[0] === '/auth/login')
      transactions.cancel(request.cookies[LOGOUT_COOKIE]);
  });
  app.post('/auth/logout', async (request, reply) => {
    const principal = store.getPrincipal(request.cookies['autokosova_session']);
    const csrf = request.cookies['autokosova_csrf'];
    // A browser with an expired session can still clear its provider session using the
    // double-submit cookie. For a live session, also bind CSRF to the server principal.
    if (
      !csrf ||
      request.headers['x-csrf-token'] !== csrf ||
      (principal && principal.csrfToken !== csrf)
    )
      return reply.code(principal ? 403 : 401).send({ error: 'Logout authorization required' });
    store.revokeSession(request.cookies['autokosova_session']);
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
      config?.endSessionEndpoint && config.postLogoutRedirectUri
        ? transactions.begin(locale)
        : undefined;
    if (!binding) return { redirectTo: `/auth/logged-out?locale=${locale}` };
    reply.setCookie(LOGOUT_COOKIE, binding, { ...cookieOptions, maxAge: ttl / 1000 });
    return { redirectTo: '/auth/logout/provider' };
  });

  app.get('/auth/logout/provider', async (request, reply) => {
    const transaction = transactions.handoff(request.cookies[LOGOUT_COOKIE]);
    if (!transaction || !config)
      return reply.code(400).send({ error: 'Logout handoff invalid or expired' });
    return reply.redirect(createEndSessionUrl(config, transaction.state, transaction.locale));
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
    body: 'Die lokale Sitzung ist beendet. Die Abmeldung beim Anmeldeanbieter ist nicht konfiguriert oder konnte nicht gestartet werden. Beim nächsten Login wird eine erneute Authentifizierung angefordert.',
    home: 'Zur Startseite',
    login: 'Erneut anmelden',
  },
  sq: {
    title: 'Keni dalë nga AutoKosova',
    body: 'Sesioni lokal ka përfunduar. Dalja nga ofruesi i identitetit nuk është konfiguruar ose nuk mund të nisej. Hyrja tjetër do të kërkojë autentikim të ri.',
    home: 'Faqja kryesore',
    login: 'Hyni përsëri',
  },
  en: {
    title: 'Signed out of AutoKosova',
    body: 'Your local session has ended. Identity-provider logout is not configured or could not be started. Your next sign-in will request fresh authentication.',
    home: 'Back to home',
    login: 'Sign in again',
  },
};
