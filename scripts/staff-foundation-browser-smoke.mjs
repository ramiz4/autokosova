import { checkModerationWorkspace } from './moderation-workspace-browser-checks.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { freePort, startBrowser, until } from './inquiries-test-browser.mjs';
import { startTestOidc } from './inquiries-test-oidc.mjs';
import { seedDatabase } from './db/seed-data.mjs';

assert.notEqual(process.env.NODE_ENV, 'production');
const target = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
const root = new pg.Client({ connectionString: target.toString() });
await root.connect();
const schema = 'staff_browser_' + randomUUID().replaceAll('-', '');
await root.query(`CREATE SCHEMA ${schema}`);
target.searchParams.set('options', '-csearch_path=' + schema + ',public');
const client = new pg.Client({ connectionString: target.toString() });
await client.connect();
const admin = 'staff-browser-admin-' + randomUUID(),
  moderator = 'staff-browser-moderator-' + randomUUID();
const port = await freePort();
const provider = await startTestOidc(`http://127.0.0.1:${port}/auth/callback`, moderator);
const environment = {
  ...provider.environment,
  DATABASE_URL: target.toString(),
  AUTOKOSOVA_LOCAL_DEMO_FILES: '1',
  AUTOKOSOVA_DEMO_ADMIN_SUBJECT: admin,
  AUTOKOSOVA_DEMO_MODERATOR_SUBJECT: moderator,
};
let browser;
const output = 'test-results/staff-foundation';
try {
  const directory = new URL('../db/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort())
    await client.query(
      (await readFile(new URL(file, directory), 'utf8')).replaceAll("'public.", "'" + schema + '.'),
    );
  await seedDatabase(client, 'demo-workflows', environment);
  browser = await startBrowser(port, environment);
  async function login(role, locale = 'de', returnTo) {
    provider.setSubject(role === 'admin' ? admin : moderator);
    provider.setRoles([role]);
    provider.setProfile({ name: 'DEMO ' + role, preferred_username: 'demo-' + role });
    await browser.evaluate('window.__oldStaffDocument=true');
    const query = returnTo ? 'returnTo=' + encodeURIComponent(returnTo) : 'locale=' + locale;
    await browser.command('Page.navigate', { url: browser.origin + '/auth/login?' + query });
    const destination =
      returnTo ??
      (locale === 'de' ? '' : '/' + locale) + (role === 'admin' ? '/admin' : '/moderation');
    // The admin has assigned the fixtures to moderators, not to themselves. Their explicit
    // "My cases" destination is therefore honestly empty, unlike the populated role landings.
    const expectedContent =
      role === 'admin' && destination.endsWith('/moderation')
        ? "!!document.querySelector('[data-staff-empty]')"
        : "document.querySelectorAll('[data-staff-row]').length>0";
    await until(
      () =>
        browser.evaluate(
          `!window.__oldStaffDocument && location.pathname===${JSON.stringify(destination)} && document.querySelector('[data-staff-list]')?.getAttribute('aria-busy')==='false' && ${expectedContent}`,
        ),
      'signed OIDC staff landing ' + role,
    );
  }
  async function logout() {
    await browser.click('button[aria-controls="account-menu"]');
    await browser.click('#account-menu > button');
    await until(
      () =>
        browser.evaluate(
          `!document.querySelector('[data-staff-list]') && ['/', '/sq', '/en'].includes(location.pathname)`,
        ),
      'regular staff logout',
    );
  }
  await login('moderator');
  assert.equal(
    await browser.evaluate(
      `!!document.querySelector('[data-case-id="review:demo-staff-review-foreign"]')`,
    ),
    false,
  );
  await browser.click('[data-case-id="review:demo-staff-review-assigned"] [data-open-case]');
  await until(
    () => browser.evaluate(`!!document.querySelector('[data-evidence]')`),
    'assigned detail',
  );
  await browser.click('[data-evidence]');
  await until(
    () =>
      browser.evaluate(
        `document.querySelector('[data-evidence-text]')?.textContent.includes('DEMO – kein echter Nachweis')`,
      ),
    'actual private fixture bytes',
  );
  await logout();
  await login('admin');
  await browser.click('[data-case-id="review:demo-staff-review-unassigned"] [data-open-case]');
  await until(
    () => browser.evaluate(`!!document.querySelector('#staff-assignee')`),
    'assignment form',
  );
  await browser.fill('#staff-assignee', moderator);
  await browser.click('[data-assign]');
  await until(
    () =>
      browser.evaluate(
        `document.querySelector('[data-case-assignee]')?.textContent.includes('DEMO moderator')`,
      ),
    'persisted assignment reflected in the open case',
  );
  await logout();
  await login('moderator');
  await browser.click('[data-case-id="review:demo-staff-review-unassigned"] [data-open-case]');
  await until(
    () => browser.evaluate(`!!document.querySelector('[data-escalate]')`),
    'assigned moderation detail',
  );
  await browser.click('[data-escalate-panel] summary');
  await browser.fill('#staff-escalation', 'requires_admin');
  const pending = browser.click('[data-escalate]');
  await new Promise((resolve) => setTimeout(resolve, 150));
  await browser.command('Page.handleJavaScriptDialog', { accept: true });
  await pending;
  await until(
    () =>
      browser.evaluate(
        `!!document.querySelector('[data-staff-list]') && !document.querySelector('[data-case-id="review:demo-staff-review-unassigned"]')`,
      ),
    'escalation relinquishes assignment',
  );
  await logout();
  await login('admin');
  await until(
    () =>
      browser.evaluate(
        `!!document.querySelector('[data-case-id="review:demo-staff-review-unassigned"] [data-escalated]')`,
      ),
    'admin sees actual escalation',
  );
  const snapshot = await client.query(
    "SELECT revision,status,escalation_reason,assigned_moderator_user_id FROM moderation_case WHERE id='review:demo-staff-review-unassigned'",
  );
  await seedDatabase(client, 'demo-workflows', environment);
  assert.deepEqual(
    (
      await client.query(
        "SELECT revision,status,escalation_reason,assigned_moderator_user_id FROM moderation_case WHERE id='review:demo-staff-review-unassigned'",
      )
    ).rows,
    snapshot.rows,
  );
  await mkdir(output, { recursive: true });
  await checkModerationWorkspace({ browser, client, login, output });
  for (const locale of ['de', 'sq', 'en']) {
    for (const role of ['admin', 'moderator']) {
      await login(role, locale);
      for (const width of [1280, 390]) {
        await browser.command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width === 390,
        });
        assert.equal(
          await browser.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
          true,
          'No horizontal overflow',
        );
        assert.equal(await browser.evaluate('document.documentElement.lang'), locale);
        await browser.screenshot(`${output}/${role}-${locale}-${width}.png`, width, true);
      }
    }
  }
  // Explicit, authorized return targets take precedence over the role landing.
  await login('admin', 'de', '/moderation');
  assert.equal(await browser.evaluate('location.pathname'), '/moderation');
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-staff-row]').length"), 0);
  assert.equal(await browser.evaluate("!!document.querySelector('[data-staff-empty]')"), true);
  // A normal guest page and direct API cannot reuse any previous staff identity.
  await logout();
  assert.equal(await browser.evaluate("fetch('/api/staff/cases').then(r=>r.status)"), 401);
  assert.equal(browser.errors.length, 0);
  await browser.close();
  browser = undefined;
  // A new server process reads the persisted case; no seed/reset is needed to retain decisions.
  browser = await startBrowser(port, environment);
  await login('admin');
  assert.equal(
    await browser.evaluate(
      `!!document.querySelector('[data-case-id="review:demo-staff-review-unassigned"] [data-escalated]')`,
    ),
    true,
  );
  await writeFile(
    output + '/result.json',
    JSON.stringify(
      {
        synthetic: true,
        roles: ['admin', 'moderator'],
        languages: ['de', 'sq', 'en'],
        widths: [1280, 390],
        assignment: true,
        escalation: true,
        privateFixtureRead: true,
        seedPreserved: true,
        restartPreserved: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'Staff foundation browser: signed OIDC, assignment, escalation, private fixture, restart and 12 viewport/locale checks passed.',
  );
} finally {
  await browser?.close();
  await provider.close();
  await client.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
}
