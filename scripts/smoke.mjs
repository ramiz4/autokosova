import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 4100;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});

async function waitFor(url) {
  const end = Date.now() + 10_000;
  let lastError;

  while (Date.now() < end) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(2000) });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Server did not start: ${String(lastError)}\n${output}`);
}

try {
  const health = await waitFor(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  for (const prefix of ['', '/sq', '/en']) {
    const alias = `${origin}${prefix}/monetarisierung?source=information`;
    const response = await fetch(alias, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    assert.ok([301, 302, 307, 308].includes(response.status), `Expected SSR redirect: ${alias}`);
    const location = response.headers.get('location');
    assert.ok(location, `Missing redirect target: ${alias}`);
    assert.equal(
      new URL(location, origin).href,
      `${origin}${prefix}/monetization?source=information`,
    );
  }

  // Only local, synthetic public pages. No session or private request is created.
  const pending = new Set([
    '/',
    '/sq',
    '/en',
    '/monetization',
    '/sq/monetization',
    '/en/monetization',
    '/garages/footer-smoke-missing',
    '/sq/garages/footer-smoke-missing',
    '/en/garages/footer-smoke-missing',
  ]);
  const visited = new Set();
  for (const path of pending) {
    if (visited.has(path)) continue;
    assert.ok(visited.size < 60, 'Unexpected footer route expansion');
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const footer = html.match(/<app-site-footer\b[^>]*>[\s\S]*?<\/app-site-footer>/)?.[0];
    assert.ok(footer, `Missing shared footer: ${path}`);
    assert.equal((html.match(/<footer(?:\s|>)/g) ?? []).length, 1, path);
    assert.match(footer, /\/branding\/autokosova-logo-header\.png/);
    assert.match(footer, new RegExp(`${new Date().getFullYear()} AutoKosova`));
    assert.doesNotMatch(footer, /href="#"|href="(?:mailto:|tel:)/);
    const locale =
      path === '/sq' || path.startsWith('/sq/') ? 'sq' : path.startsWith('/en') ? 'en' : 'de';
    const prefix = locale === 'de' ? '' : `/${locale}`;
    assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.ok(footer.includes(`href="${prefix}/inquiry"`), path);
    assert.ok(footer.includes(`href="${prefix}/garages/new"`), path);
    for (const [, href] of footer.matchAll(/\bhref="([^"]+)"/g)) {
      if (href.startsWith('https://')) continue;
      assert.ok(href.startsWith('/') && !href.startsWith('//'), `Invalid footer link: ${href}`);
      assert.doesNotMatch(href, /\/(?:anfrage|werkstatt|werkstaetten|suche)(?:\/|$)/);
      pending.add(href);
    }
    visited.add(path);
  }
  console.log(`Verified the shared footer and links on ${visited.size} localized SSR pages.`);
} finally {
  server.kill('SIGTERM');
}
