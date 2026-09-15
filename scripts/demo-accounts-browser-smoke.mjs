import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { seedDatabase } from './db/seed-data.mjs';
import { demoAccountGarageIds, demoAccountRequestIds } from './db/demo-accounts.mjs';
import { freePort, startBrowser, until } from './inquiries-test-browser.mjs';
import { startTestOidc } from './inquiries-test-oidc.mjs';

// An isolated schema, browser profile and signing provider; never a production/login bypass.
assert.notEqual(process.env.NODE_ENV, 'production');
const target = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
const root = new pg.Client({ connectionString: target.toString() });
const schema = 'demo_accounts_browser_' + randomUUID().replaceAll('-', '');
await root.connect();
await root.query(`CREATE SCHEMA ${schema}`);
target.searchParams.set('options', '-csearch_path=' + schema + ',public');
const client = new pg.Client({ connectionString: target.toString() });
const garageSubject = 'browser-garage-' + randomUUID();
const customerSubject = 'browser-customer-' + randomUUID();
const port = await freePort();
const provider = await startTestOidc(`http://127.0.0.1:${port}/auth/callback`, garageSubject);
const config = {
  ...provider.environment,
  AUTOKOSOVA_DEMO_GARAGE_SUBJECT: garageSubject,
  AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: customerSubject,
};
let browser;
const output = 'test-results/demo-accounts';
try {
  await client.connect();
  const directory = new URL('../db/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
    const sql = (await readFile(new URL(file, directory), 'utf8')).replaceAll(
      "'public.",
      "'" + schema + '.',
    );
    await client.query(sql);
  }
  await seedDatabase(client, 'demo-workflows', config);
  browser = await startBrowser(port, { ...provider.environment, DATABASE_URL: target.toString() });
  const { command, evaluate, fill, click } = browser;
  async function login(subject, path, selector, count) {
    provider.setSubject(subject);
    await command('Page.navigate', {
      url: browser.origin + '/auth/login?returnTo=' + encodeURIComponent(path),
    });
    await until(
      () =>
        evaluate(
          `location.pathname === ${JSON.stringify(path)} && document.querySelectorAll(${JSON.stringify(selector)}).length === ${count}`,
        ),
      'signed OIDC login and owned data',
    );
  }
  async function screenshot(name, width) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 960,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await until(
      () => evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
      'no horizontal overflow',
    );
    // Capture only the signed-in application, never provider pages or callback URLs.
    assert.ok(!(await evaluate("location.pathname.startsWith('/auth/')")));
    await mkdir(output, { recursive: true });
    const image = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(`${output}/${name}-${width}.png`, Buffer.from(image.data, 'base64'));
  }
  // General sign-in follows the server-owned account type, preserving all supported locales.
  for (const locale of ['de', 'sq', 'en']) {
    const prefix = locale === 'de' ? '' : '/' + locale;
    for (const [subject, path, selector] of [
      [garageSubject, '/garages/new', '[data-owned-garage]'],
      [customerSubject, '/inquiries', '[data-inquiry-card]'],
    ]) {
      provider.setSubject(subject);
      await command('Page.navigate', {
        url: browser.origin + '/auth/login?locale=' + locale,
      });
      await until(
        () =>
          evaluate(
            `location.pathname === ${JSON.stringify(prefix + path)} && document.querySelectorAll(${JSON.stringify(selector)}).length === 2`,
          ),
        'localized general OIDC landing',
      );
      if (subject === garageSubject)
        assert.equal(
          await evaluate(
            "document.querySelectorAll('[data-garage-status][data-state=published]').length",
          ),
          2,
        );
    }
  }
  // An explicit customer workflow remains usable by an operator, without a role switch.
  await login(garageSubject, '/sq/inquiries', '[data-inquiries-empty]', 1);
  await login(garageSubject, '/garages/new', '[data-owned-garage]', 2);
  assert.equal(
    await evaluate(
      "!!document.querySelector('form, header[aria-labelledby=onboarding-hero-title]')",
    ),
    false,
  );
  await screenshot('garage-overview', 1280);
  await screenshot('garage-overview', 390);
  await click('button[aria-controls="account-menu"]');
  await until(
    () => evaluate("!!document.querySelector('[data-account-garages]')"),
    'business menu',
  );
  assert.equal(await evaluate("!!document.querySelector('[data-account-inquiries]')"), false);
  await click('button[aria-controls="account-menu"]');
  await click('[data-owned-garage="' + demoAccountGarageIds[0] + '"]');
  await until(
    () => evaluate("!!document.querySelector('[data-delete-garage]')"),
    'owner deletion control',
  );
  await fill('#garage-name', 'Browsergeprüfte fiktive Werkstatt');
  await click('form button[type="submit"]');
  await until(
    async () =>
      evaluate(
        `fetch('/api/garages/${demoAccountGarageIds[0]}', {cache:'no-store'}).then(r=>r.json()).then(g=>g.profile.name === 'Browsergeprüfte fiktive Werkstatt')`,
      ),
    'persisted garage edit',
  );
  await click('[data-garages-back]');
  await until(
    () =>
      evaluate(
        "!!document.querySelector('[data-garages-overview]') && !document.querySelector('form')",
      ),
    'overview after saved edit',
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-garages-overview]').textContent.includes('Browsergeprüfte fiktive Werkstatt')",
    ),
  );
  await click('[data-owned-garage="' + demoAccountGarageIds[0] + '"]');
  await until(
    () => evaluate("!!document.querySelector('[data-delete-garage]')"),
    'reopen same saved garage',
  );
  await screenshot('garage', 1280);
  await screenshot('garage', 390);
  // A native confirmation is required; no application response is intercepted.
  const deletion = click('[data-delete-garage]');
  await until(async () => {
    try {
      await command('Page.handleJavaScriptDialog', { accept: true });
      return true;
    } catch {
      return false;
    }
  }, 'native deletion confirmation');
  await deletion;
  await until(
    () =>
      evaluate(
        "document.querySelectorAll('[data-owned-garage]').length === 1 && !document.querySelector('[data-delete-garage]')",
      ),
    'deleted garage removed',
  );
  await seedDatabase(client, 'demo-workflows', config);
  await command('Page.reload', { ignoreCache: true });
  await until(
    () => evaluate("document.querySelectorAll('[data-owned-garage]').length === 1"),
    'deletion survives reseed and reload',
  );
  await click('[data-new-garage]');
  assert.equal(await evaluate("document.querySelector('#garage-name').value"), '');
  await login(customerSubject, '/inquiries', '[data-inquiry-card]', 2);
  await click('button[aria-controls="account-menu"]');
  await until(
    () => evaluate("!!document.querySelector('[data-account-inquiries]')"),
    'private customer menu',
  );
  assert.equal(await evaluate("!!document.querySelector('[data-account-garages]')"), false);
  await click('button[aria-controls="account-menu"]');
  await screenshot('customer', 1280);
  await screenshot('customer', 390);
  // Test the seeded requests themselves, not replacement rows created by the test.
  for (const [index, id] of demoAccountRequestIds.entries()) {
    await click(`[data-inquiry-id="${id}"] [data-edit-inquiry]`);
    await until(
      () => evaluate("!!document.querySelector('[data-inquiry-editor][open]')"),
      'seeded inquiry opens in the actual editor',
    );
    const symptom = `Fiktive Demo-Anfrage ${index + 1}: im Browser bearbeitet.`;
    await fill('#edit-symptom', symptom);
    await click('[data-save-inquiry]');
    await until(
      () =>
        evaluate(
          "!document.querySelector('[data-inquiry-editor]') && !!document.querySelector('[data-inquiry-notice]')",
        ),
      'saved demo inquiry edit',
    );
    const row = await client.query(
      'SELECT symptom FROM repair_request WHERE id=$1 AND owner_user_id=$2',
      [id, customerSubject],
    );
    assert.equal(row.rows[0].symptom, symptom);
  }
  await seedDatabase(client, 'demo-workflows', config);
  await command('Page.reload', { ignoreCache: true });
  await until(
    () =>
      evaluate(
        "document.querySelectorAll('[data-inquiry-card]').length === 2 && document.querySelector('main').textContent.includes('im Browser bearbeitet')",
      ),
    'demo inquiry edits survive reseed and reload',
  );
  const removedId = demoAccountRequestIds[1];
  await click(`[data-inquiry-id="${removedId}"] [data-inquiry-menu]`);
  await click(`[data-inquiry-id="${removedId}"] [data-delete-inquiry]`);
  await until(
    () => evaluate("!!document.querySelector('[data-delete-dialog][open]')"),
    'inquiry delete confirmation',
  );
  await click('[data-confirm-delete]');
  await until(
    () => evaluate("document.querySelectorAll('[data-inquiry-card]').length === 1"),
    'demo inquiry deleted',
  );
  await seedDatabase(client, 'demo-workflows', config);
  await command('Page.reload', { ignoreCache: true });
  await until(
    () => evaluate("document.querySelectorAll('[data-inquiry-card]').length === 1"),
    'deleted inquiry not reseeded',
  );
  assert.equal(
    (await client.query('SELECT 1 FROM repair_request WHERE id=$1', [removedId])).rowCount,
    0,
  );

  assert.equal(
    await evaluate(`fetch('/api/garages/${demoAccountGarageIds[1]}').then(r=>r.status)`),
    403,
  );
  assert.equal(
    await evaluate("fetch('/api/me/garages').then(r=>r.json()).then(r=>r.garages.length)"),
    0,
  );
  assert.deepEqual(browser.errors, []);
  console.log(
    'PASS: localized general login, explicit target precedence, signed OIDC garage/customer switching, assigned records, private navigation, garage and seeded inquiry edit/delete/reseed, new form and desktop/mobile layout.',
  );
} finally {
  await browser?.close();
  await provider.close();
  await client.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
}
