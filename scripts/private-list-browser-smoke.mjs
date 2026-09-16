import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { freePort, startBrowser, until } from './inquiries-test-browser.mjs';

// Test-driver-only API fixtures, installed before Angular. No application login bypass.
function installFixtures() {
  const realFetch = window.fetch.bind(window);
  const fixture = (window.__privateLists = {
    counts: {},
    completed: 0,
    paused: false,
    waiting: [],
    guest: false,
    revision: 0,
    favorites: Array.from({ length: 13 }, (_, i) => `fictional-garage-${i}`),
    release() {
      this.paused = false;
      this.waiting.splice(0).forEach((done) => done());
    },
  });
  const detail = (id) => ({
    id,
    active: true,
    revision: 1,
    createdAt: '2026-09-14T12:00:00Z',
    updatedAt: '2026-09-14T12:00:00Z',
    serviceCategoryId: 'bremsen',
    symptom: 'FIKTIVER TESTFALL – keine echte Kundenanfrage',
    areas: [],
    attachmentIds: [],
    earliestDropoffOn: '2026-10-02',
    latestPickupOn: '2026-10-06',
  });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (
      url.origin !== location.origin ||
      !(url.pathname.startsWith('/api/me') || url.pathname.startsWith('/api/public/garages/'))
    )
      return realFetch(input, init);
    const path = url.pathname;
    fixture.counts[path] = (fixture.counts[path] ?? 0) + 1;
    let body,
      status = 200;
    if (path === '/api/me') {
      if (fixture.paused) await new Promise((resolve) => fixture.waiting.push(resolve));
      status = fixture.guest ? 401 : 200;
      body = fixture.guest
        ? { loginAvailable: true }
        : {
            userId: 'fictional-list-owner',
            displayName: `Fiktives Konto ${fixture.revision}`,
            roles: ['customer'],
            garageMemberships: [],
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          };
      fixture.completed++;
    } else {
      // Even fast local responses must not hide the intermediate reset.
      await new Promise((resolve) => setTimeout(resolve, 90));
      if (path === '/api/me/favorites') body = { garageIds: fixture.favorites };
      else if (path.startsWith('/api/me/favorites/')) {
        fixture.favorites = fixture.favorites.filter((id) => id !== path.split('/').at(-1));
        status = 204;
      } else if (path === '/api/me/repair-requests') {
        const next = url.searchParams.has('cursor');
        body = {
          requests: [0, 1].map((i) => {
            const row = detail(`fictional-request-${i + (next ? 2 : 0)}`);
            return {
              id: row.id,
              active: true,
              revision: 1,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              serviceCategoryId: row.serviceCategoryId,
              areas: [],
              symptomPreview: row.symptom,
            };
          }),
          nextCursor: next ? null : 'fictional-request-1',
        };
      } else if (path.startsWith('/api/me/repair-requests/')) body = detail(path.split('/').at(-1));
      else {
        const id = path.split('/').at(-1);
        body = {
          id,
          name: `FIKTIVE Werkstatt ${id}`,
          placeId: 'xk-peja',
          photoIds: [],
          serviceCategoryIds: ['bremsen'],
          verificationLabel: 'Unternehmensdaten geprüft',
        };
      }
    }
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}

const app = await startBrowser(await freePort(), { DATABASE_URL: '' });
const results = [];
const output = 'test-results/private-lists';
try {
  await app.command('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${installFixtures.toString()})()`,
  });
  async function beginObservation(selector) {
    await app.evaluate(`(() => {
      const selector = ${JSON.stringify(selector)};
      const nodes = [...document.querySelectorAll(selector)];
      const boxes = nodes.map((node) => { const r = node.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; });
      const texts = nodes.map((node) => node.textContent);
      const y = scrollY;
      const state = window.__listObservation = { errors: [], frames: 0, active: true };
      const fail = (reason) => { if (!state.errors.includes(reason)) state.errors.push(reason); };
      const observer = new MutationObserver((records) => {
        if (records.some((record) => [...record.removedNodes].some((removed) =>
          nodes.some((node) => removed === node || removed.contains(node))))) fail('card removed from DOM');
      });
      observer.observe(document.querySelector('main'), { childList: true, subtree: true });
      state.stop = () => { state.active = false; observer.disconnect(); };
      const frame = () => {
        if (!state.active) return;
        state.frames++;
        const current = [...document.querySelectorAll(selector)];
        if (current.length !== nodes.length || current.some((node, i) => node !== nodes[i])) fail('card identity/count changed');
        if (Math.abs(scrollY-y) > 1) fail('scroll position changed');
        nodes.forEach((node, i) => {
          const r=node.getBoundingClientRect();
          if ([r.x,r.y,r.width,r.height].some((v,j) => Math.abs(v-boxes[i][j]) > 1)) fail('card geometry changed');
          if (node.textContent !== texts[i]) fail('card contents changed');
        });
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    })()`);
  }
  async function refresh(trigger) {
    const completed = await app.evaluate('window.__privateLists.completed');
    await app.evaluate('window.__privateLists.paused = true; window.__privateLists.revision++');
    if (trigger === 'menu') await app.click('[data-account-trigger]');
    else
      await app.evaluate(
        'window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus"));',
      );
    await until(
      () => app.evaluate('window.__privateLists.waiting.length === 1'),
      'one deduplicated session request',
    );
    await delay(140);
    await app.evaluate('window.__privateLists.release()');
    await until(
      () => app.evaluate(`window.__privateLists.completed === ${completed + 1}`),
      'revalidation response',
    );
    await delay(180);
    if (trigger === 'menu') await app.click('[data-account-trigger]');
    await delay(50);
  }
  const listCounts = () =>
    app.evaluate(
      `Object.fromEntries(Object.entries(window.__privateLists.counts).filter(([path]) => path !== '/api/me'))`,
    );
  for (const locale of ['de', 'sq', 'en']) {
    for (const width of [390, 620, 1280]) {
      await app.command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 640,
      });
      for (const page of ['inquiries', 'favorites']) {
        const selector = page === 'inquiries' ? '[data-inquiry-card]' : '[data-favorite-card]';
        const prefix = locale === 'de' ? '' : '/' + locale;
        await app.navigate(
          `${prefix}/${page}`,
          `document.querySelectorAll('${selector}').length > 0`,
        );
        if (page === 'inquiries') {
          await app.click('[data-inquiry-filter="active"]');
          await until(
            () =>
              app.evaluate(
                `document.querySelector('[data-inquiries-list]')?.getAttribute('aria-busy') === 'false'`,
              ),
            'filtered inquiries',
          );
          await app.click('[data-inquiries-more]');
          await until(
            () => app.evaluate(`document.querySelectorAll('${selector}').length === 4`),
            'inquiry pagination',
          );
          await app.click('[data-inquiry-view]');
          await until(
            () =>
              app.evaluate(
                `document.querySelector('[data-inquiry-detail]')?.textContent.includes('FIKTIVER TESTFALL')`,
              ),
            'inquiry detail',
          );
        } else {
          await until(
            () =>
              app.evaluate(`document.querySelectorAll('[data-favorite-profile]').length === 12`),
            'favorite profiles',
          );
          await app.click('[data-favorites-more]');
          await until(
            () =>
              app.evaluate(`document.querySelectorAll('[data-favorite-profile]').length === 13`),
            'favorite pagination',
          );
        }
        await app.evaluate('document.fonts.ready');
        await app.evaluate('window.scrollTo({ top: 160, behavior: "instant" })');
        await delay(80);
        const counts = await listCounts();
        await beginObservation(selector);
        for (let repeat = 0; repeat < 2; repeat++) {
          await refresh('menu');
          await refresh('focus');
        }
        const observation = await app.evaluate(
          'window.__listObservation.stop(); ({ errors: window.__listObservation.errors, frames: window.__listObservation.frames })',
        );
        assert.deepEqual(
          observation.errors,
          [],
          `${page}, ${locale}, ${width}: list must remain mounted and stationary`,
        );
        assert.ok(observation.frames >= 10);
        assert.deepEqual(
          await listCounts(),
          counts,
          'Session refresh must not cascade to list/profile requests',
        );
        if (page === 'inquiries') {
          assert.equal(
            await app.evaluate(
              `document.querySelector('[data-inquiry-filter="active"]').getAttribute('aria-pressed')`,
            ),
            'true',
          );
          assert.ok(await app.evaluate(`!!document.querySelector('[data-inquiry-detail]')`));
        } else {
          // A real cross-tab signal still refreshes data, without reverting to skeletons.
          await beginObservation(selector);
          await app.evaluate(
            'const c = new BroadcastChannel("autokosova-favorites"); c.postMessage("changed"); c.close();',
          );
          await until(
            async () =>
              (await listCounts())['/api/me/favorites'] === counts['/api/me/favorites'] + 1,
            'explicit cross-tab reload',
          );
          await delay(250);
          const errors = await app.evaluate(
            'window.__listObservation.stop(); window.__listObservation.errors',
          );
          assert.deepEqual(errors, [], 'Background favorite reload must preserve cards');
          await app.click('[data-favorite-remove]');
          await until(
            () => app.evaluate(`document.querySelectorAll('${selector}').length === 12`),
            'confirmed favorite removal',
          );
        }
        // Capture from document origin after finishing the scroll-stability assertions.
        await app.evaluate('window.scrollTo({ top: 0, behavior: "instant" })');
        await delay(50);
        await app.screenshot(`${output}/${page}-${locale}-${width}.png`, width, true);
        results.push({
          page,
          locale,
          width,
          sessionRefreshes: 4,
          listRequestsFromSessionRefresh: 0,
          observedFrames: observation.frames,
        });
        console.log(
          `Stable list refresh: ${page}, ${locale}, ${width}px; menu/focus x2, DOM/geometry/scroll and request counts passed`,
        );
      }
    }
  }
  // The pre-existing privacy boundary for an actually hidden tab is deliberately retained.
  await app.navigate('/inquiries', `document.querySelectorAll('[data-inquiry-card]').length === 2`);
  const { targetInfo } = await app.command('Target.getTargetInfo');
  await app.command('Emulation.setFocusEmulationEnabled', { enabled: false });
  const { targetId } = await app.command('Target.createTarget', { url: 'about:blank' });
  try {
    await app.command('Target.activateTarget', { targetId });
    await until(
      () =>
        app.evaluate(
          `document.visibilityState === 'hidden' && !document.querySelector('[data-inquiry-card]')`,
        ),
      'hidden tab clears private data',
    );
    await app.command('Target.activateTarget', { targetId: targetInfo.targetId });
    await app.command('Page.bringToFront');
    await until(
      () =>
        app.evaluate(
          `document.visibilityState === 'visible' && document.querySelectorAll('[data-inquiry-card]').length === 2`,
        ),
      'visible tab revalidates and reloads',
    );
  } finally {
    await app.command('Target.closeTarget', { targetId });
  }
  await app.evaluate(
    'window.__privateLists.guest = true; window.dispatchEvent(new Event("focus"));',
  );
  await until(
    () =>
      app.evaluate(
        `!!document.querySelector('[data-inquiries-login]') && !document.querySelector('[data-inquiry-card]')`,
      ),
    '401 removes private cards',
  );
  assert.deepEqual(app.errors, []);
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(
      {
        fixture: 'synthetic API, not live OIDC',
        results,
        hiddenTab: 'passed',
        unauthorized: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
