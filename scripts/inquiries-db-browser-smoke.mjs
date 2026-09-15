import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { freePort, startBrowser, until } from './inquiries-test-browser.mjs';
import { startTestOidc } from './inquiries-test-oidc.mjs';

// Only synthetic accounts in a disposable local DB; never a provider/prod configuration change.
assert.notEqual(process.env.NODE_ENV, 'production');
const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
assert.equal(database.pathname, '/autokosova');
const pool = new pg.Pool({ connectionString: database.toString() });
const owners = [`browser-a-${randomUUID()}`, `browser-b-${randomUUID()}`];
const port = await freePort();
const provider = await startTestOidc(`http://127.0.0.1:${port}/auth/callback`, owners[0]);
let browser;
let completed = false;
const output = 'test-results/inquiries-db';
const draftKey = 'autokosova.repair-request-draft.v1';
const draft = JSON.stringify({
  serviceCategoryId: 'motor',
  symptom: 'Unabhängiger lokaler Testentwurf',
});
const hasCards = `document.querySelectorAll('[data-inquiry-card]').length > 0`;
try {
  browser = await startBrowser(port, provider.environment);
  const { command, evaluate, fill, click } = browser;
  async function login(owner, path = '/inquiries') {
    provider.setSubject(owner);
    await command('Page.navigate', {
      url: browser.origin + '/auth/login?returnTo=' + encodeURIComponent(path),
    });
    await until(
      () =>
        evaluate(
          `location.pathname === ${JSON.stringify(path)} && !!document.querySelector('[data-inquiries-list]')`,
        ),
      'signed OIDC return',
    );
  }
  async function api(path, method = 'GET', body, revision) {
    return evaluate(`(async () => {
      const token=document.cookie.split('; ').find(c=>c.startsWith('autokosova_csrf='))?.split('=')[1] ?? '';
      const response=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},credentials:'same-origin',cache:'no-store',
        headers:{'x-csrf-token':token,${body === undefined ? '' : "'content-type':'application/json',"}${revision === undefined ? '' : `'if-match':${JSON.stringify('"' + revision + '"')},`}},
        ${body === undefined ? '' : `body:${JSON.stringify(JSON.stringify(body))},`}});
      return {status:response.status,data:response.status === 204 ? null : await response.json()};
    })()`);
  }
  async function ready(count) {
    await until(
      () =>
        evaluate(
          `document.querySelectorAll('[data-inquiry-card]').length === ${count} && document.querySelector('[data-inquiries-list]')?.getAttribute('aria-busy') === 'false'`,
        ),
      'DB-backed list',
    );
  }
  async function reload(count = 3) {
    await command('Page.reload', { ignoreCache: true });
    await ready(count);
  }
  const card = (id) => `[data-inquiry-id="${id}"]`;
  async function dbRow(id) {
    return (
      await pool.query(
        'SELECT id,active,revision,symptom,vehicle_id FROM repair_request WHERE id=$1 AND owner_user_id=$2',
        [id, owners[0]],
      )
    ).rows[0];
  }
  await login(owners[0]);
  await ready(0);
  await click('[data-new-inquiry]');
  await until(
    () =>
      evaluate(
        `location.pathname === '/inquiry' && !!document.querySelector('form [formcontrolname="model"]')`,
      ),
    'existing creation wizard',
  );
  await fill('[formcontrolname="makeId"]', 'skoda');
  await fill('[formcontrolname="model"]', 'Octavia');
  await fill('[formcontrolname="year"]', '2018');
  async function next(selector) {
    await evaluate(
      `[...document.querySelectorAll('form button')].find(button=>button.textContent.trim() === 'Weiter').click()`,
    );
    await until(
      () => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),
      'wizard next step',
    );
  }
  await next('[formcontrolname="symptom"]');
  await fill('[formcontrolname="serviceCategoryId"]', 'bremsen');
  await fill(
    '[formcontrolname="symptom"]',
    'Bremsen prüfen und Beläge bei Bedarf wechseln. Beim Bremsen ist ein leichtes Quietschen hörbar.',
  );
  await next('[formcontrolname="earliestDropoffOn"]');
  await fill('[formcontrolname="earliestDropoffOn"]', '2026-10-02');
  await fill('[formcontrolname="latestPickupOn"]', '2026-10-06');
  await next('input[type="file"]');
  await next('form button[data-variant="outline"]');
  await until(
    () =>
      evaluate(
        `[...document.querySelectorAll('form button')].some(button=>button.textContent.trim() === 'Entwurf privat speichern')`,
      ),
    'wizard summary',
  );
  await evaluate(
    `[...document.querySelectorAll('form button')].find(button=>button.textContent.trim() === 'Entwurf privat speichern').click()`,
  );
  await until(
    () =>
      evaluate(
        `document.querySelector('form').textContent.includes('Privat im Konto gespeichert.')`,
      ),
    'confirmed form save',
  );
  const rows = await pool.query('SELECT id FROM repair_request WHERE owner_user_id=$1', [
    owners[0],
  ]);
  assert.equal(rows.rowCount, 1, 'The existing form wrote exactly one real DB row');
  const id = rows.rows[0].id;
  assert.equal((await dbRow(id)).revision, 1);
  await click('button[aria-controls="account-menu"]');
  await click('[data-account-inquiries]');
  await ready(1);
  await evaluate(`sessionStorage.setItem(${JSON.stringify(draftKey)},${JSON.stringify(draft)})`);
  const sample = {
    areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
    earliestDropoffOn: '2026-10-02',
    latestPickupOn: '2026-10-06',
    serviceCategoryId: 'service-inspektion',
    symptom: 'Jahresservice mit Öl- und Filterwechsel vor der Rückreise.',
    vehicle: { makeId: 'volkswagen', model: 'Golf', year: 2020, fuel: 'diesel' },
  };
  const second = await api('/api/me/repair-requests', 'POST', sample);
  assert.equal(second.status, 201);
  const third = await api('/api/me/repair-requests', 'POST', {
    ...sample,
    serviceCategoryId: 'reifen',
    symptom: 'Winterreifen montieren und auswuchten lassen.',
    vehicle: undefined,
    areas: [{ placeId: 'xk-peja', radiusKm: 15 }],
  });
  assert.equal(third.status, 201);
  await reload();
  // Actual edit dialog -> PUT -> PostgreSQL -> reload. No response interception.
  await click(card(id) + ' [data-edit-inquiry]');
  await until(
    () => evaluate(`!!document.querySelector('[data-inquiry-editor][open]')`),
    'native editor',
  );
  assert.equal(await evaluate(`document.activeElement.id`), 'edit-service');
  await fill('#edit-model', 'Octavia Combi');
  await fill(
    '#edit-symptom',
    'Bremsbeläge vorne prüfen und bei Bedarf wechseln. Bitte auch die Bremsscheiben kontrollieren.',
  );
  await click('[data-save-inquiry]');
  await until(
    () =>
      evaluate(
        `!document.querySelector('[data-inquiry-editor]') && !!document.querySelector('[data-inquiry-notice]')`,
      ),
    'confirmed edit',
  );
  assert.equal((await dbRow(id)).revision, 2);
  assert.equal(
    (await pool.query('SELECT model FROM vehicle WHERE id=$1', [(await dbRow(id)).vehicle_id]))
      .rows[0].model,
    'Octavia Combi',
  );
  await reload();
  assert.ok(
    await evaluate(
      `document.querySelector(${JSON.stringify(card(id))}).textContent.includes('Octavia Combi')`,
    ),
  );
  // Observe the rendered synthetic fixtures without intercepting application responses.
  await evaluate(`window.lifecycleCards = [...document.querySelectorAll('[data-inquiry-card]')];
    window.lifecycleRemoved = false;
    window.lifecycleObserver = new MutationObserver(records => {
      for (const record of records) for (const node of record.removedNodes)
        if (node.nodeType === 1 && (node.matches('[data-inquiry-card]') || node.querySelector('[data-inquiry-card]')))
          window.lifecycleRemoved = true;
    });
    window.lifecycleObserver.observe(document.querySelector('[data-inquiries-list]'), {childList: true, subtree: true});`);
  await click(card(second.data.id) + ' [data-deactivate-inquiry]');
  await ready(3);
  assert.equal(
    await evaluate(
      `window.lifecycleCards.every(card => card.isConnected) && !window.lifecycleRemoved`,
    ),
    true,
    'Status changes must not unmount any cards',
  );
  await evaluate('window.lifecycleObserver.disconnect()');
  assert.equal((await dbRow(second.data.id)).active, false);
  await reload();
  assert.equal(
    await evaluate(
      `!!document.querySelector(${JSON.stringify(card(second.data.id) + ' [data-inquiry-search]')})`,
    ),
    false,
  );
  await click('[data-inquiry-filter="active"]');
  await ready(2);
  await click('[data-inquiry-filter="inactive"]');
  await ready(1);
  await click(card(second.data.id) + ' [data-reactivate-inquiry]');
  await ready(0);
  assert.equal((await dbRow(second.data.id)).active, true);
  await until(
    () => evaluate(`document.activeElement.id === 'inquiries-title'`),
    'focus after filtered row removal',
  );
  await click('[data-inquiry-filter="active"]');
  await ready(3);
  await click(card(second.data.id) + ' [data-deactivate-inquiry]');
  await ready(2);
  assert.equal((await dbRow(second.data.id)).active, false);
  await click('[data-inquiry-filter="inactive"]');
  await ready(1);
  await click('[data-inquiry-filter="all"]');
  await ready(3);
  for (const locale of ['de', 'sq', 'en']) {
    const path = `${locale === 'de' ? '' : '/' + locale}/inquiries`;
    for (const width of [360, 390, 430, 1280]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 640,
      });
      await browser.navigate(path, hasCards);
      await ready(3);
      await evaluate('document.fonts.ready');
      assert.equal(await evaluate(`document.documentElement.lang`), locale);
      assert.deepEqual(
        await evaluate(`(() => {
        const main=document.querySelector('main'), visible=el=>el.getClientRects().length>0;
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,
          clipped:[...main.querySelectorAll('h1,h2,p,button,a,dd,li')].filter(visible).some(el=>el.scrollWidth>el.clientWidth+1),
          small:[...main.querySelectorAll('button,a')].filter(visible).some(el=>{const b=el.getBoundingClientRect();return b.width<44||b.height<44;})};
      })()`),
        { overflow: false, clipped: false, small: false },
        `${locale}/${width} layout`,
      );
      await evaluate(
        `document.querySelector(${JSON.stringify(card(id) + ' [data-inquiry-menu]')}).focus()`,
      );
      await browser.key('Enter', 13);
      await until(
        () => evaluate(`!!document.querySelector('[data-toggle-inquiry]')`),
        'keyboard actions',
      );
      await browser.key('Escape', 27);
      assert.ok(
        await evaluate(
          `document.activeElement.matches('[data-inquiry-menu]:focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2`,
        ),
      );
      await evaluate('window.scrollTo(0,0)');
      await browser.screenshot(`${output}/${locale}-${width}.png`, width);
      await click(card(id) + ' [data-edit-inquiry]');
      await until(
        () => evaluate(`!!document.querySelector('[data-inquiry-editor][open]')`),
        'localized edit',
      );
      assert.ok(
        await evaluate(`document.querySelector('dialog').contains(document.activeElement)`),
      );
      assert.equal(
        await evaluate(
          `document.querySelector('dialog').scrollWidth > document.querySelector('dialog').clientWidth+1`,
        ),
        false,
      );
      if ((locale === 'de' && width === 1280) || (locale === 'en' && width === 390))
        await browser.screenshot(`${output}/${locale}-${width}-edit.png`, width, true);
      await browser.key('Escape', 27);
      await until(
        () => evaluate(`!document.querySelector('[data-inquiry-editor]')`),
        'escape clean editor',
      );
      const search = new URL(
        await evaluate(
          `document.querySelector(${JSON.stringify(card(id) + ' [data-inquiry-search]')}).href`,
        ),
      );
      assert.deepEqual([...search.searchParams.keys()].sort(), ['all', 'service']);
      assert.equal(await evaluate(`sessionStorage.getItem(${JSON.stringify(draftKey)})`), draft);
      console.log(
        `DB-backed overview and editor passed: ${locale}, ${width}px (synthetic DB records)`,
      );
    }
  }
  await browser.navigate('/inquiries', hasCards);
  await ready(3);
  // Concurrent client change: UI keeps the unsaved edit, shows a conflict, never overwrites.
  await click(card(id) + ' [data-edit-inquiry]');
  await until(
    () => evaluate(`!!document.querySelector('[data-inquiry-editor][open]')`),
    'conflict editor',
  );
  await fill('#edit-symptom', 'Dieser veraltete Testtext darf nicht gespeichert werden.');
  assert.equal(
    (await api(`/api/me/repair-requests/${id}`, 'PATCH', { active: false }, 2)).status,
    200,
  );
  await click('[data-save-inquiry]');
  await until(
    () =>
      evaluate(`document.querySelector('dialog [role="alert"]')?.textContent.includes('geändert')`),
    'revision conflict',
  );
  assert.ok(!(await dbRow(id)).symptom.includes('veraltete'));
  await browser.key('Escape', 27);
  await until(
    () => evaluate(`!!document.querySelector('[data-discard-edit]')`),
    'dirty confirmation',
  );
  await click('[data-discard-edit]');
  await reload();
  await click(card(id) + ' [data-reactivate-inquiry]');
  await ready(3);
  assert.equal((await dbRow(id)).active, true);
  await reload();
  // Delete uses the safe default focus, explicit confirmation and a genuine DELETE transaction.
  await click(card(third.data.id) + ' [data-inquiry-menu]');
  await click(card(third.data.id) + ' [data-delete-inquiry]');
  await until(
    () => evaluate(`!!document.querySelector('[data-delete-dialog][open]')`),
    'delete dialog',
  );
  assert.equal(await evaluate(`document.activeElement.hasAttribute('data-cancel-delete')`), true);
  assert.ok(
    await evaluate(
      `document.querySelector('[data-delete-summary]').textContent.includes('Winterreifen')`,
    ),
  );
  assert.ok(
    await evaluate(
      `document.querySelector('[data-delete-dialog]').textContent.includes('stattdessen deaktivieren')`,
    ),
  );
  assert.equal(
    await evaluate(`document.querySelector('[data-confirm-delete]').textContent.trim()`),
    'Anfrage löschen',
  );
  await browser.key('Escape', 27);
  await until(() => evaluate(`!document.querySelector('[data-delete-dialog]')`), 'cancel delete');
  assert.ok(await dbRow(third.data.id));
  await click(card(third.data.id) + ' [data-inquiry-menu]');
  await click(card(third.data.id) + ' [data-delete-inquiry]');
  await click('[data-confirm-delete]');
  await ready(2);
  assert.equal(await dbRow(third.data.id), undefined);
  await reload(2);
  assert.equal((await api(`/api/me/repair-requests/${third.data.id}`)).status, 404);
  // Switch accounts using another cryptographically verified login, not a injected session.
  await login(owners[1]);
  await ready(0);
  assert.equal((await api(`/api/me/repair-requests/${id}`)).status, 404);
  assert.equal((await api(`/api/me/repair-requests/${id}`, 'DELETE', undefined, 4)).status, 404);
  await login(owners[0], '/sq/inquiries');
  await ready(2);
  assert.ok(provider.exchanges >= 3);
  // Verify private HTTP policy against a genuine signed-in server response and real stored text.
  const privatePolicy = await evaluate(
    `(async()=>{const r=await fetch('/sq/inquiries',{cache:'no-store'});const html=await r.text();return {cache:r.headers.get('cache-control'),robots:r.headers.get('x-robots-tag'),leak:html.includes('Octavia Combi')||html.includes('Bremsbeläge vorne')};})()`,
  );
  assert.deepEqual(privatePolicy, {
    cache: 'private, no-store',
    robots: 'noindex, nofollow',
    leak: false,
  });
  // These are exclusively the random fixtures created above in the isolated test database.
  // Check deletion of an inactive inquiry and then the final active inquiry in the UI.
  for (const requestId of [second.data.id, id]) {
    const revision = (await dbRow(requestId)).revision;
    await click(card(requestId) + ' [data-inquiry-menu]');
    await click(card(requestId) + ' [data-delete-inquiry]');
    await until(
      () => evaluate(`!!document.querySelector('[data-delete-dialog][open]')`),
      'final fixture delete dialog',
    );
    await click('[data-confirm-delete]');
    await ready(requestId === second.data.id ? 1 : 0);
    await until(
      () => evaluate(`document.activeElement.id === 'inquiries-title'`),
      'focus after fixture deletion',
    );
    assert.equal((await api(`/api/me/repair-requests/${requestId}`)).status, 404);
    assert.equal(
      (await api(`/api/me/repair-requests/${requestId}`, 'PATCH', { active: true }, revision))
        .status,
      404,
    );
  }
  await reload(0);
  assert.equal(await evaluate(`!!document.querySelector('[data-inquiries-empty]')`), true);
  assert.equal((await api('/auth/logout', 'POST')).status, 204);
  await command('Page.reload', { ignoreCache: true });
  await until(
    () => evaluate(`!!document.querySelector('[data-inquiries-login]') && !(${hasCards})`),
    'real logout',
  );
  assert.equal((await api('/api/me/repair-requests')).status, 401);
  assert.deepEqual(browser.errors, []);
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(
      {
        dataSource: 'PostgreSQL, real private API; no intercepted application responses',
        identity: 'Isolated signed OIDC test provider with PKCE; not live Test-ZITADEL',
        passed: [
          'existing form creation',
          'independent SQL verification',
          'edit and reload',
          'deactivate and filters',
          'reactivate',
          'revision conflict',
          'confirmed delete and reload',
          'two account isolation',
          'logout',
          'SSR privacy',
          'DE/SQ/EN desktop/mobile keyboard',
        ],
      },
      null,
      2,
    ),
  );
  completed = true;
  console.log(
    'Actual database/form/edit/deactivate/reactivate/delete/account-isolation browser checks passed. Not live Test-ZITADEL.',
  );
} finally {
  if (!completed && browser)
    await browser.screenshot(`${output}/failure.png`, 1280, true).catch(() => undefined);
  await browser?.close();
  await provider.close();
  // Remove only this run's synthetic data. No global reset and no production file deletion.
  await pool.query(
    'DELETE FROM repair_request_attachment WHERE repair_request_id IN (SELECT id FROM repair_request WHERE owner_user_id = ANY($1::text[]))',
    [owners],
  );
  await pool.query(
    'DELETE FROM request_search_area WHERE repair_request_id IN (SELECT id FROM repair_request WHERE owner_user_id = ANY($1::text[]))',
    [owners],
  );
  await pool.query('DELETE FROM repair_request WHERE owner_user_id = ANY($1::text[])', [owners]);
  await pool.query('DELETE FROM vehicle WHERE owner_user_id = ANY($1::text[])', [owners]);
  await pool.query('DELETE FROM app_user WHERE id = ANY($1::text[])', [owners]);
  await pool.end();
}
