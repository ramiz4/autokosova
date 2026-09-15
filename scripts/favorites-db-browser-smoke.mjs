import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { freePort, startBrowser, until } from './inquiries-test-browser.mjs';
import { startTestOidc } from './inquiries-test-oidc.mjs';

// Only synthetic accounts in a disposable local DB; the app uses its normal signed OIDC flow.
assert.notEqual(process.env.NODE_ENV, 'production');
const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname));
assert.equal(database.pathname, '/autokosova');
const pool = new pg.Pool({ connectionString: database.toString() });
const suffix = randomUUID(),
  owners = ['favorites-a-' + suffix, 'favorites-b-' + suffix];
const blank = 'favorite-photo-empty-' + suffix,
  hidden = 'favorite-hidden-' + suffix;
const primary = 'demo-prishtina-bremsen',
  second = 'demo-peja-klima';
const port = await freePort(),
  provider = await startTestOidc(`http://127.0.0.1:${port}/auth/callback`, owners[0]);
const output = 'test-results/favorites-db';
let browser;
const ready = `!!document.querySelector('[data-favorites-list]') && document.querySelector('[data-favorites-list]').getAttribute('aria-busy') === 'false'`;
const card = (id) => `[data-favorite-id="${id}"]`;
const checks = [];
try {
  await pool.query(
    "INSERT INTO garage (id,name,publication_state,place_id) VALUES ($1,'TEST · Werkstatt ohne Bild','published','xk-gjilan'),($2,'PRIVATE-HIDDEN-NAME','published','xk-peja')",
    [blank, hidden],
  );
  // Existing operator favorites must be discoverable without saving them again.
  await pool.query(
    "INSERT INTO app_user (id,oidc_subject,status,account_type) VALUES ($1,$1,'active','garage')",
    [owners[1]],
  );
  await pool.query('INSERT INTO garage_favorite (owner_user_id,garage_id) VALUES ($1,$2)', [
    owners[1],
    primary,
  ]);
  browser = await startBrowser(port, provider.environment);
  const { command, evaluate, click } = browser;
  async function api(path, method = 'GET') {
    return evaluate(`(async()=>{
      const token=document.cookie.split('; ').find(c=>c.startsWith('autokosova_csrf='))?.split('=')[1] ?? '';
      const response=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},credentials:'same-origin',cache:'no-store',headers:{'x-csrf-token':token}});
      return {status:response.status,data:response.status===204?null:await response.json()};
    })()`);
  }
  async function login(owner, path = '/favorites') {
    provider.setSubject(owner);
    await command('Page.navigate', {
      url: browser.origin + '/auth/login?returnTo=' + encodeURIComponent(path),
    });
    await until(
      () =>
        evaluate(
          `location.pathname === ${JSON.stringify(path)} && (!!document.querySelector('[data-favorites-empty]') || ${ready})`,
        ),
      'signed OIDC favorites return',
    );
  }
  async function sqlIds(owner = owners[0]) {
    return (
      await pool.query(
        'SELECT garage_id FROM garage_favorite WHERE owner_user_id=$1 ORDER BY garage_id',
        [owner],
      )
    ).rows.map((row) => row.garage_id);
  }
  async function count(expected) {
    await until(
      () =>
        evaluate(
          `document.querySelectorAll('[data-favorite-card]').length===${expected} && (${ready})`,
        ),
      'resolved favorites count ' + expected,
    );
  }
  async function keyboard(selector) {
    await until(
      () =>
        evaluate(`(() => {
        const control = document.querySelector(${JSON.stringify(selector)});
        if (!control || control.disabled || !control.getClientRects().length) return false;
        control.focus();
        return document.activeElement === control;
      })()`),
      'focusable control ' + selector,
    );
    await browser.key('Enter', 13);
  }
  await login(owners[0]);
  assert.deepEqual(await sqlIds(), []);
  await browser.navigate(
    '/garages?places=xk-pristina:10&service=bremsen',
    `!![...document.querySelectorAll('button[aria-pressed]')].find(button=>button.getAttribute('aria-label').includes('DEMO · Bremsen Prishtina') && !button.disabled)`,
  );
  await evaluate(
    `[...document.querySelectorAll('button[aria-pressed]')].find(button=>button.getAttribute('aria-label').includes('DEMO · Bremsen Prishtina')).click()`,
  );
  await until(async () => (await sqlIds()).includes(primary), 'heart persisted to PostgreSQL');
  assert.equal((await api('/api/me/favorites/' + second, 'PUT')).status, 204);
  for (const id of [blank, hidden])
    assert.equal((await api('/api/me/favorites/' + id, 'PUT')).status, 204);
  await pool.query("UPDATE garage SET publication_state='suspended' WHERE id=$1", [hidden]);
  checks.push(
    'search heart -> actual PostgreSQL favorite; public profiles outside the original filter',
  );
  await browser.navigate('/favorites', ready);
  await count(4);
  assert.ok(
    await evaluate(
      `!!document.querySelector(${JSON.stringify(card(second) + ' [data-favorite-profile]')})`,
    ),
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector(${JSON.stringify(card(hidden) + ' [data-favorite-profile]')})`,
    ),
    false,
  );
  assert.equal(
    await evaluate(`document.querySelector('main').textContent.includes('PRIVATE-HIDDEN-NAME')`),
    false,
  );
  assert.ok(
    await evaluate(
      `!!document.querySelector(${JSON.stringify(card(blank) + ' [data-favorite-no-photo]')})`,
    ),
  );
  assert.equal(await evaluate(`!!document.querySelector('app-rating-stars')`), false);
  // A failed DELETE must leave the row and card intact. Never output cookie values.
  await evaluate(
    `window.__favoriteCsrf=document.cookie.split('; ').find(c=>c.startsWith('autokosova_csrf='))?.split('=')[1];document.cookie='autokosova_csrf=invalid-test-csrf; path=/';`,
  );
  await click(card(blank) + ' [data-favorite-remove]');
  await until(
    () => evaluate(`!!document.querySelector('[data-favorite-remove-error]')`),
    'failed remove stays visible',
  );
  assert.ok((await sqlIds()).includes(blank));
  await count(4);
  await evaluate(
    `document.cookie='autokosova_csrf='+window.__favoriteCsrf+'; path=/';delete window.__favoriteCsrf;`,
  );
  await browser.navigate('/favorites', ready);
  await mkdir(output, { recursive: true });
  for (const locale of ['de', 'sq', 'en']) {
    const path = (locale === 'de' ? '' : '/' + locale) + '/favorites';
    const response = await fetch(browser.origin + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Cookie');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.doesNotMatch(
      await response.text(),
      /favorite-photo-empty|favorites-a-|PRIVATE-HIDDEN-NAME|demo-prishtina-bremsen/,
    );
    for (const width of [360, 390, 430, 1280]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 640,
      });
      await browser.navigate(path, ready);
      await count(4);
      await keyboard('button[aria-controls="account-menu"]');
      await until(
        () => evaluate(`!!document.querySelector('[data-account-favorites]')`),
        'account menu link',
      );
      assert.deepEqual(
        await evaluate(
          `(()=>{const link=document.querySelector('[data-account-favorites]');return [link.getAttribute('href'),link.getAttribute('aria-current'),link.classList.contains('bg-blue-50')];})()`,
        ),
        [path, 'page', true],
      );
      await evaluate(`document.querySelector('[data-account-favorites]').focus()`);
      assert.ok(
        await evaluate(
          `document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2`,
        ),
      );
      await browser.key('Escape', 27);
      await until(
        () =>
          evaluate(
            `!document.querySelector('#account-menu') && document.activeElement.matches('button[aria-controls="account-menu"]')`,
          ),
        'Escape restores focus',
      );
      await count(4);
      const layout = await evaluate(
        `(()=>{const main=document.querySelector('main'),visible=el=>el.getClientRects().length>0;return {overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...main.querySelectorAll('p,h1,h2,h3,a,button')].filter(visible).some(el=>el.scrollWidth>el.clientWidth+1),smallTargets:[...main.querySelectorAll('a,button')].filter(visible).some(el=>{const r=el.getBoundingClientRect();return r.width<44||r.height<44;})};})()`,
      );
      assert.deepEqual(layout, { overflow: false, clipped: false, smallTargets: false });
      assert.equal(
        await evaluate(
          `document.querySelector(${JSON.stringify(card(primary) + ' [data-favorite-profile]')}).getAttribute('href')`,
        ),
        (locale === 'de' ? '' : '/' + locale) + '/garages/' + primary,
      );
      // Load lazy images before the screenshot without bypassing the real photo endpoint.
      await evaluate('window.scrollTo(0,document.body.scrollHeight)');
      await until(
        () =>
          evaluate(
            `[...document.querySelectorAll('[data-favorite-photo]')].every(img=>img.complete && img.naturalWidth>0)`,
          ),
        'public DB photo route',
      );
      await evaluate('window.scrollTo(0,0)');
      await browser.screenshot(`${output}/${locale}-${width}.png`, width);
      console.log(`Favorites DB layout/keyboard passed: ${locale} ${width}px`);
    }
  }
  checks.push(
    'DE/SQ/EN at 360/390/430/1280; no overflow; real public images, neutral missing profiles; private SSR',
  );
  await browser.navigate('/favorites', ready);
  await count(4);
  await click(card(primary) + ' [data-favorite-profile]');
  await until(
    () =>
      evaluate(
        `location.pathname === '/garages/${primary}' && !!document.querySelector('app-garage-profile h1')`,
      ),
    'public profile',
  );
  await evaluate('history.back()');
  await until(() => evaluate(`location.pathname === '/favorites' && (${ready})`), 'history back');
  await evaluate('history.forward()');
  await until(
    () =>
      evaluate(
        `location.pathname === '/garages/${primary}' && !!document.querySelector('app-garage-profile h1')`,
      ),
    'history forward',
  );
  await evaluate('history.back()');
  await until(() => evaluate(`location.pathname === '/favorites' && (${ready})`), 'return');
  await click(card(hidden) + ' [data-favorite-remove]');
  await until(async () => !(await sqlIds()).includes(hidden), 'remove unavailable favorite');
  await count(3);
  await click(card(primary) + ' [data-favorite-remove]');
  await until(async () => !(await sqlIds()).includes(primary), 'confirmed remove persisted');
  await count(2);
  await browser.navigate(
    '/garages?places=xk-pristina:10&service=bremsen',
    `!![...document.querySelectorAll('button[aria-pressed]')].find(button=>button.getAttribute('aria-label').includes('DEMO · Bremsen Prishtina') && !button.disabled)`,
  );
  assert.equal(
    await evaluate(
      `[...document.querySelectorAll('button[aria-pressed]')].find(button=>button.getAttribute('aria-label').includes('DEMO · Bremsen Prishtina')).getAttribute('aria-pressed')`,
    ),
    'false',
  );
  checks.push(
    'profile/history navigation; remove unavailable profile; search heart reflects confirmed deletion',
  );
  await login(owners[1]);
  assert.equal((await api('/api/me')).data.accountType, 'garage');
  assert.deepEqual(await sqlIds(owners[1]), [primary]);
  await count(1);
  for (const locale of ['de', 'sq', 'en']) {
    const prefix = locale === 'de' ? '' : '/' + locale;
    for (const width of [390, 1280]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 640,
      });
      await browser.navigate(
        prefix + '/profile',
        `!!document.querySelector('main [data-account-favorites]')`,
      );
      assert.equal(
        await evaluate(`document.querySelectorAll('main [data-account-favorites]').length`),
        1,
      );
      assert.equal(
        await evaluate(
          `document.querySelector('main [data-account-favorites]').getAttribute('href')`,
        ),
        prefix + '/favorites',
      );
      assert.ok(await evaluate(`!!document.querySelector('main [data-account-garages]')`));
      await keyboard('main [data-account-favorites]');
      await until(
        () =>
          evaluate(`location.pathname === ${JSON.stringify(prefix + '/favorites')} && (${ready})`),
        'operator profile to favorites',
      );
      await count(1);
      await keyboard('button[aria-controls="account-menu"]');
      await until(
        () => evaluate(`!!document.querySelector('#account-menu [data-account-favorites]')`),
        'operator favorites menu',
      );
      assert.deepEqual(
        await evaluate(
          `(()=>{const menu=document.querySelector('#account-menu');const link=menu.querySelector('[data-account-favorites]');return {count:menu.querySelectorAll('[data-account-favorites]').length,href:link.getAttribute('href'),active:link.getAttribute('aria-current'),business:!!menu.querySelector('[data-account-garages]'),inquiries:!!menu.querySelector('[data-account-inquiries]')};})()`,
        ),
        {
          count: 1,
          href: prefix + '/favorites',
          active: 'page',
          business: true,
          inquiries: false,
        },
      );
      await evaluate(`document.querySelector('#account-menu [data-account-favorites]').focus()`);
      assert.ok(
        await evaluate(
          `document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2`,
        ),
      );
      assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));
      await browser.screenshot(`${output}/operator-${locale}-${width}.png`, width);
      await browser.key('Escape', 27);
      await until(
        () =>
          evaluate(
            `!document.querySelector('#account-menu') && document.activeElement.matches('[aria-controls="account-menu"]')`,
          ),
        'operator Escape and focus return',
      );
      await keyboard('button[aria-controls="account-menu"]');
      await keyboard('#account-menu [data-account-favorites]');
      await until(
        () => evaluate(`!document.querySelector('#account-menu') && (${ready})`),
        'operator menu selection closes',
      );
      console.log(`Operator favorites navigation passed: ${locale} ${width}px`);
    }
  }
  const profileReady = `!!document.querySelector('app-garage-profile button[aria-pressed]:not(:disabled)')`;
  await browser.navigate('/garages/' + primary, profileReady);
  assert.equal(
    await evaluate(
      `document.querySelector('app-garage-profile button[aria-pressed]').getAttribute('aria-pressed')`,
    ),
    'true',
  );
  await browser.navigate('/garages/' + second, profileReady);
  assert.equal(
    await evaluate(
      `document.querySelector('app-garage-profile button[aria-pressed]').getAttribute('aria-pressed')`,
    ),
    'false',
  );
  await keyboard('app-garage-profile button[aria-pressed]');
  await until(
    async () => (await sqlIds(owners[1])).includes(second),
    'operator profile heart persists',
  );
  await browser.navigate('/favorites', ready);
  await count(2);
  for (const id of [primary, second]) {
    await keyboard(card(id) + ' [data-favorite-remove]');
    await until(async () => !(await sqlIds(owners[1])).includes(id), 'operator removal persists');
  }
  await until(
    () => evaluate(`!!document.querySelector('[data-favorites-empty]')`),
    'operator empty state',
  );
  assert.deepEqual(await sqlIds(owners[1]), []);
  assert.equal((await api('/api/me/favorites/' + second, 'DELETE')).status, 204);
  assert.ok((await sqlIds(owners[0])).includes(second));
  checks.push(
    'operator: existing favorites, profile and account navigation, DE/SQ/EN at 390/1280, keyboard, profile heart, persistent remove; customer list unchanged',
  );
  await login(owners[0]);
  await count(2);
  assert.deepEqual((await api('/api/me/favorites')).data.garageIds.sort(), [blank, second].sort());
  const more = (
    await pool.query(
      "SELECT id FROM garage WHERE id LIKE 'demo-%' AND publication_state='published' ORDER BY id",
    )
  ).rows.map((row) => row.id);
  for (const id of more) assert.equal((await api('/api/me/favorites/' + id, 'PUT')).status, 204);
  await browser.navigate('/favorites', ready);
  await count(12);
  await click('[data-favorites-more]');
  await count(24);
  await click('[data-favorites-more]');
  await count(more.length + 1);
  assert.equal(await evaluate(`!!document.querySelector('[data-favorites-more]')`), false);
  // Remove through the same DELETE contract, then remove the final card in the UI.
  for (const id of more) assert.equal((await api('/api/me/favorites/' + id, 'DELETE')).status, 204);
  await browser.navigate('/favorites', ready);
  await count(1);
  await click(card(blank) + ' [data-favorite-remove]');
  await until(
    () => evaluate(`!!document.querySelector('[data-favorites-empty]')`),
    'last removal gives empty state',
  );
  assert.deepEqual(await sqlIds(), []);
  await keyboard('button[aria-controls="account-menu"]');
  await until(
    () => evaluate(`!!document.querySelector('[data-account-favorites]')`),
    'logout menu',
  );
  await evaluate(
    `[...document.querySelectorAll('#account-menu button')].find(button=>button.textContent.includes('Abmelden')).click()`,
  );
  await until(() => evaluate(`location.pathname === '/'`), 'logout');
  await browser.navigate('/sq/favorites', `!!document.querySelector('[data-favorites-login]')`);
  assert.equal(
    await evaluate(`document.querySelector('[data-favorites-login]').getAttribute('href')`),
    '/auth/login?returnTo=%2Fsq%2Ffavorites',
  );
  assert.equal((await api('/api/me/favorites')).status, 401);
  checks.push(
    'two signed accounts and re-login; CSRF failure; 12/24/all pagination; last removal and logout',
  );
  assert.deepEqual(browser.errors, []);
  assert.ok(provider.exchanges >= 3);
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(
      {
        dataSource:
          'actual PostgreSQL via unchanged favorites HTTP contracts; synthetic records only',
        apiInterception: false,
        authentication: 'local signed PKCE OIDC, NOT the live ZITADEL instance',
        checks,
      },
      null,
      2,
    ),
  );
  console.log(
    'Favorites real database browser checks passed. Local signed OIDC; not live ZITADEL.',
  );
} catch (error) {
  await browser?.screenshot(`${output}/failure.png`, 1280, true).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await provider.close();
  await pool.query('DELETE FROM garage_favorite WHERE owner_user_id=ANY($1::text[])', [owners]);
  await pool.query('DELETE FROM garage WHERE id=ANY($1::text[])', [[blank, hidden]]);
  await pool.query('DELETE FROM app_user WHERE id=ANY($1::text[])', [owners]);
  await pool.end();
}
