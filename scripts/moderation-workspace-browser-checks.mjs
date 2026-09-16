import assert from 'node:assert/strict';
import { until } from './inquiries-test-browser.mjs';

/** Uses the existing signed OIDC/application/DB harness, never mocked decision responses. */
export async function checkModerationWorkspace({ browser, client, login, output }) {
  async function open(id, locale = 'de', queue = 'todo') {
    // The list shell renders before its asynchronous rows/hasMore. Reading disabled during
    // that interval would mistake a pending page for the end of the authorized queue.
    await browser.evaluate('window.__oldModerationDocument=true');
    await browser.command('Page.navigate', {
      url: browser.origin + (locale === 'de' ? '' : '/' + locale) + '/moderation?queue=' + queue,
    });
    await until(
      () =>
        browser.evaluate(
          `!window.__oldModerationDocument && !!document.querySelector('[data-staff-list][aria-busy="false"] [data-staff-row]')`,
        ),
      'moderation list',
    );
    const selector = '[data-case-id=' + JSON.stringify(id) + '] [data-open-case]';
    for (let page = 1; page <= 20; page++) {
      if (await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) {
        await browser.click(selector);
        await until(
          () => browser.evaluate('!!document.querySelector("[data-case-heading]")'),
          'moderation case content',
        );
        return;
      }
      assert.equal(
        await browser.evaluate('document.querySelector("[data-next-cases]")?.disabled'),
        false,
        'case exists in authorized paginated list',
      );
      const rows = await browser.evaluate(
        'document.querySelector("[data-staff-list]")?.textContent',
      );
      await browser.click('[data-next-cases]');
      await until(
        () =>
          browser.evaluate(
            `!!document.querySelector('[data-staff-list][aria-busy="false"] [data-staff-row]') && document.querySelector('[data-staff-list]')?.textContent!==${JSON.stringify(rows)}`,
          ),
        'next authorized case page',
      );
    }
    throw new Error('Authorized case missing from bounded demo list');
  }
  async function confirmSubmit(accept = true, selector = '[data-submit-decision]') {
    const click = browser.click(selector);
    await new Promise((done) => setTimeout(done, 100));
    await browser.command('Page.handleJavaScriptDialog', { accept });
    await click;
    if (accept)
      await until(
        () => browser.evaluate('!!document.querySelector("[data-staff-case] [role=status]")'),
        'persisted decision result remains visible',
      );
  }
  async function state(id) {
    return (await client.query('SELECT publication_state FROM garage_review WHERE id=$1', [id]))
      .rows[0].publication_state;
  }
  await login('moderator');
  await open('review:demo-staff-review-assigned');
  assert.equal(
    await browser.evaluate('document.querySelector("[data-publish-review]").disabled'),
    true,
  );
  await browser.click('[data-evidence]');
  await until(
    () =>
      browser.evaluate(
        'document.querySelector("[data-evidence-text]")?.textContent.includes("DEMO – kein echter Nachweis")',
      ),
    'read the actual private evidence',
  );
  for (const field of ['garageMatches', 'serviceMatches', 'visitMonthMatches'])
    await browser.click('input[name="' + field + '"]');
  await until(
    () => browser.evaluate('!document.querySelector("[data-publish-review]").disabled'),
    'all evidence checks required',
  );
  await confirmSubmit(false, '[data-publish-review]');
  assert.equal(await state('demo-staff-review-assigned'), 'under_review');
  await confirmSubmit(true, '[data-publish-review]');
  assert.equal(await state('demo-staff-review-assigned'), 'published');
  assert.equal(
    (
      await client.query(
        "SELECT work_quality FROM garage_review WHERE id='demo-staff-review-assigned'",
      )
    ).rows[0].work_quality,
    2,
  );
  await open('review:demo-staff-review-mismatch');
  await browser.click('[data-reject-review]');
  assert.equal(
    await browser.evaluate('document.querySelector("[data-submit-decision]").disabled'),
    true,
  );
  await browser.fill('#review-rejection-reason', 'evidence_not_sufficient');
  await confirmSubmit();
  assert.equal(await state('demo-staff-review-mismatch'), 'rejected');
  await open('review:demo-staff-review-blocked');
  assert.equal(await browser.evaluate('!!document.querySelector("[data-publish-review]")'), false);
  assert.equal(await browser.evaluate('!!document.querySelector("[data-evidence]")'), false);
  await browser.click('[data-action="request_information"]');
  await until(
    () => browser.evaluate('!!document.querySelector("[data-staff-case] [role=status]")'),
    'request for information saved',
  );
  assert.equal(
    (
      await client.query(
        "SELECT status FROM moderation_case WHERE id='review:demo-staff-review-blocked'",
      )
    ).rows[0].status,
    'waiting_for_subject',
  );
  await open('demo-staff-review-reported-report');
  await browser.click('[data-action="temporarily_hide"]');
  await browser.fill('#moderation-reason', 'private_data_exposure');
  await confirmSubmit();
  assert.equal(await state('demo-staff-review-reported'), 'temporarily_hidden');
  assert.equal(
    (await client.query("SELECT 1 FROM public_garage_review WHERE id='demo-staff-review-reported'"))
      .rowCount,
    0,
  );
  await open('demo-staff-review-reported-report', 'de', 'done');
  await confirmSubmit(true, '[data-action="restore"]');
  assert.equal(await state('demo-staff-review-reported'), 'published');
  await open('demo-staff-profile-report');
  await until(
    () =>
      browser.evaluate(
        'Array.from(document.querySelectorAll("[data-staff-case] img")).length===4 && Array.from(document.querySelectorAll("[data-staff-case] img")).every(image=>image.complete && image.naturalWidth>0)',
      ),
    'actual public demo profile photo context',
  );
  await browser.click('[data-action="temporarily_hide"]');
  await browser.fill('#moderation-reason', 'policy_violation');
  await confirmSubmit();
  await open('demo-staff-profile-report', 'de', 'done');
  await confirmSubmit(true, '[data-action="restore"]');
  await open('review:demo-staff-review-own-appeal');
  assert.equal(await browser.evaluate('!!document.querySelector("[data-decision-form]")'), false);
  assert.equal(await browser.evaluate('!!document.querySelector("[data-escalate]")'), true);
  await open('demo-staff-review-removed-report');
  assert.equal(await browser.evaluate('!!document.querySelector("[data-action=restore]")'), false);
  await open('review:demo-staff-review-appeal');
  for (const field of ['garageMatches', 'serviceMatches', 'visitMonthMatches'])
    await browser.click('input[name="' + field + '"]');
  await confirmSubmit(true, '[data-publish-review]');
  assert.equal(await state('demo-staff-review-appeal'), 'published');
  for (const locale of ['de', 'sq', 'en']) {
    await login('moderator', locale);
    await open('review:demo-staff-review-waiting', locale, 'waiting');
    await browser.click('[data-reject-review]');
    for (const width of [1280, 390]) {
      await browser.command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width === 390,
      });
      assert.equal(
        await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
        true,
      );
      assert.equal(await browser.evaluate('document.documentElement.lang'), locale);
      await browser.screenshot(`${output}/decision-${locale}-${width}.png`, width, true);
    }
    await browser.evaluate('document.querySelector("[data-reject-review]").focus()');
    await browser.command('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await browser.command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    assert.equal(
      await browser.evaluate('document.activeElement?.getAttribute("name")'),
      'rejectionReason',
    );
  }
  assert.equal(
    await browser.evaluate(
      "fetch('/api/staff/cases/'+encodeURIComponent('review:demo-staff-review-foreign')).then(r=>r.status)",
    ),
    404,
  );
  console.log(
    'Moderator browser: publish/cancel, reject, missing evidence, request, hide/restore, independent appeal, conflict and localized decision forms passed.',
  );
}
