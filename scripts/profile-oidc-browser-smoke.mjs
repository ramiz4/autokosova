import assert from 'node:assert/strict';
import { freePort, startBrowser, until } from './inquiries-test-browser.mjs';
import { startTestOidc } from './inquiries-test-oidc.mjs';

// Real signed PKCE + discovery + UserInfo + API + rendered UI. No intercepted app responses.
const port = await freePort();
const provider = await startTestOidc(
  `http://127.0.0.1:${port}/auth/callback`,
  'profile-customer-fixture',
);
let browser;
try {
  browser = await startBrowser(port, {
    ...provider.environment,
    DATABASE_URL: '',
    ZITADEL_USERINFO_ENDPOINT: '',
  });
  const { evaluate, command, click } = browser;
  async function login(path = '/profile') {
    await evaluate('window.__previousProfileDocument = true');
    await command('Page.navigate', {
      url: browser.origin + '/auth/login?returnTo=' + encodeURIComponent(path),
    });
    await until(
      () =>
        evaluate(
          `!window.__previousProfileDocument && location.pathname === ${JSON.stringify(path)} && !!document.querySelector('[data-account-email]')`,
        ),
      'signed UserInfo profile login',
    );
  }
  async function expectFields(name, email, username) {
    for (const [selector, expected] of [
      ['[data-account-display-name-field]', name],
      ['[data-account-email]', email],
      ['[data-account-username]', username],
    ])
      assert.equal(
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent.trim()`),
        expected,
      );
  }
  for (const locale of ['de', 'sq', 'en']) {
    const path = (locale === 'de' ? '' : '/' + locale) + '/profile';
    for (const kind of ['customer', 'garage']) {
      const profile = {
        name: `DEMO ${kind}`,
        email: `${kind}@example.invalid`,
        preferred_username: `demo-${kind}`,
      };
      provider.setSubject('profile-' + kind + '-fixture');
      provider.setProfile(profile);
      await login(path);
      await expectFields(profile.name, profile.email, profile.preferred_username);
      assert.equal(
        await evaluate("!!document.querySelector('[data-account-profile-error]')"),
        false,
      );
      const api = await evaluate(
        "fetch('/api/me',{cache:'no-store'}).then(async r=>({status:r.status,cache:r.headers.get('cache-control'),data:await r.json()}))",
      );
      assert.equal(api.status, 200);
      assert.equal(api.cache, 'private, no-store');
      assert.equal(api.data.profileStatus, 'ready');
      assert.deepEqual(api.data.roles, ['customer']);
      const ssr = await fetch(browser.origin + path);
      assert.equal(ssr.headers.get('cache-control'), 'private, no-store');
      assert.ok(!(await ssr.text()).includes(profile.email));
      await browser.navigate(path, "!!document.querySelector('[data-account-email]')");
      await expectFields(profile.name, profile.email, profile.preferred_username);
      for (const width of [390, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 960,
          deviceScaleFactor: 1,
          mobile: width < 600,
        });
        await evaluate("document.querySelector('[data-account-details]').open = true");
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
        await browser.screenshot(
          `test-results/account/userinfo-${kind}-${locale}-${width}.png`,
          width,
        );
      }
      await click('[data-account-logout]');
      await until(
        () =>
          evaluate(
            "['/','/sq','/en'].includes(location.pathname) && !document.querySelector('[data-account-email]')",
          ),
        'provider logout',
      );
      assert.equal(await evaluate("fetch('/api/me').then(r=>r.status)"), 401);
    }
  }
  provider.setProfile({
    given_name: 'Name',
    family_name: 'Fallback',
    email: 'partial@example.invalid',
  });
  await login();
  await expectFields(
    'Name Fallback',
    'partial@example.invalid',
    'Nicht vom Anmeldedienst bereitgestellt',
  );
  await click('main app-language-switcher a[href="/en/profile"]');
  await until(
    () =>
      evaluate(
        "location.pathname === '/en/profile' && document.querySelector('[data-account-username]')?.textContent.includes('Not provided')",
      ),
    'language switch preserves partial profile',
  );
  provider.setUserInfoMode('error');
  await login();
  assert.ok(await evaluate("!!document.querySelector('[data-account-profile-error]')"));
  await expectFields('Derzeit nicht abrufbar', 'Derzeit nicht abrufbar', 'Derzeit nicht abrufbar');
  provider.setUserInfoMode('ready');
  provider.setProfile({
    name: 'Recovered name',
    email: 'recovered@example.invalid',
    preferred_username: 'recovered',
  });
  await click('[data-account-profile-error] a');
  await until(
    () =>
      evaluate(
        "document.querySelector('[data-account-email]')?.textContent.includes('recovered@example.invalid')",
      ),
    'fresh login recovers provider fields',
  );
  await expectFields('Recovered name', 'recovered@example.invalid', 'recovered');
  assert.equal(await evaluate("!!document.querySelector('[data-account-profile-error]')"), false);
  assert.equal(browser.errors.length, 0);
  console.log(
    'PASS: signed PKCE, trusted discovery/UserInfo, profile fields, reload, DE/SQ/EN, 390/1280 px, logout/account switch, absent field and provider recovery',
  );
} finally {
  await browser?.close();
  await provider.close();
}
