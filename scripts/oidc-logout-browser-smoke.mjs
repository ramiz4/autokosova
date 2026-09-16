import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { freePort, startBrowser, until } from './inquiries-test-browser.mjs';
import { startSessionOidc } from './logout-test-oidc.mjs';

const checks = [];
async function scenario(configured) {
  const port = await freePort();
  const provider = await startSessionOidc(`http://127.0.0.1:${port}/auth/callback`);
  const environment = { ...provider.environment, DATABASE_URL: '' };
  if (!configured) {
    environment.ZITADEL_END_SESSION_ENDPOINT = '';
    environment.ZITADEL_POST_LOGOUT_URI = '';
  }
  const unrelated = configured ? provider.addUnrelatedSession() : undefined;
  let browser;
  try {
    browser = await startBrowser(port, environment);
    const { evaluate, click, fill, command } = browser;
    async function login(locale, account) {
      const path = `${locale === 'de' ? '' : '/' + locale}/profile`;
      await browser.navigate(path, '!!document.querySelector(\'main a[href^="/auth/login"]\')');
      await click('main a[href^="/auth/login"]');
      await until(
        () => evaluate('!!document.querySelector("[data-credential-prompt]")'),
        'provider credential prompt',
      );
      assert.equal(await evaluate('location.origin'), provider.issuer);
      // The random password exists only in this isolated provider and is never printed or captured.
      await fill('select[name="account"]', account);
      await fill('input[name="password"]', provider.password);
      await click('button[type="submit"]');
      await until(
        () =>
          evaluate(
            `location.pathname === ${JSON.stringify(path)} && document.querySelector('[data-account-id]')?.textContent.trim() === 'logout-fixture-${account}'`,
          ),
        'new verified account',
      );
      assert.ok(
        !(await evaluate(
          `document.querySelector('main').textContent.includes('logout-fixture-${account === 'a' ? 'b' : 'a'}')`,
        )),
      );
    }
    async function logout(locale, header) {
      const sessionsBefore = provider.sessionCount;
      if (header) {
        await click('button[aria-controls="account-menu"]');
        await until(
          () => evaluate('!!document.querySelector("#account-menu button")'),
          'account menu',
        );
        await evaluate('document.querySelector("#account-menu button").focus()');
        await browser.key('Enter', 13);
      } else await click('[data-account-logout]');
      const target = configured ? (locale === 'de' ? '/' : '/' + locale) : '/auth/logged-out';
      await until(
        () =>
          evaluate(
            `location.origin === ${JSON.stringify(browser.origin)} && location.pathname === ${JSON.stringify(target)} && document.readyState === 'complete'`,
          ),
        'logout browser return',
      );
      if (!configured) {
        assert.ok(await evaluate('document.body.textContent.includes("local session has ended")'));
        // The static notice intentionally forbids connect-src. Keep that CSP intact and
        // verify the same browser's revoked session from the normal guest profile page.
        await browser.navigate(
          `${locale === 'de' ? '' : '/' + locale}/profile`,
          '!!document.querySelector(\'main a[href^="/auth/login"]\')',
        );
      }
      assert.equal(
        await evaluate(`(async () => (await fetch('/api/me', {cache:'no-store'})).status)()`),
        401,
      );
      assert.equal(provider.sessionCount, configured ? sessionsBefore - 1 : sessionsBefore);
      if (unrelated) assert.equal(provider.hasSession(unrelated), true);
      assert.equal(provider.counters.selections, 0);
    }
    for (const locale of configured ? ['de', 'sq', 'en'] : ['en']) {
      for (const width of configured ? [360, 390, 430, 1280] : [390]) {
        await command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 640,
        });
        await login(locale, 'a');
        await logout(locale, true);
        await login(locale, 'b');
        await logout(locale, false);
        checks.push(
          `${configured ? 'provider' : 'local-only'} logout + fresh account A/B: ${locale} ${width}px`,
        );
      }
    }
    if (configured) {
      provider.setLogoutFailure(true);
      await login('de', 'a');
      await click('[data-account-logout]');
      await until(
        () => evaluate('document.body.textContent.includes("Test provider unavailable")'),
        'provider failure',
      );
      assert.equal(provider.sessionCount, 2);
      await browser.navigate(
        '/profile',
        '!!document.querySelector(\'main a[href^="/auth/login"]\')',
      );
      assert.equal(await evaluate(`(async () => (await fetch('/api/me')).status)()`), 401);
      await login('de', 'b');
      provider.setLogoutFailure(false);
      await logout('de', false);
      checks.push(
        'provider failure never restores local session; subsequent login requires credentials',
      );
    }
    assert.equal(provider.counters.silentLogins, 0);
    assert.deepEqual(browser.errors, []);
  } finally {
    await browser?.close();
    await provider.close();
  }
}
await scenario(true);
await scenario(false);
await mkdir('test-results/oidc-logout', { recursive: true });
await writeFile(
  'test-results/oidc-logout/verification.json',
  JSON.stringify(
    {
      provider: 'isolated stateful test provider; not the approved ZITADEL instance',
      applicationResponsesIntercepted: false,
      checks,
    },
    null,
    2,
  ),
);
console.log(
  `PASS: ${checks.length} OIDC logout/reauthentication scenarios; real browser, signed test provider, no API fixtures.`,
);
