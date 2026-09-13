import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server/app';

test('HTML and unversioned artwork revalidate while hashed Angular bundles remain cacheable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'autokosova-static-'));
  const files = [
    'index.html',
    'logo.png',
    'site.webmanifest',
    'main-ABC12345.js',
    'styles-DEADBEEF.css',
  ];
  for (const name of files) await writeFile(join(root, name), 'first revision');
  const app = createServer({ staticRoot: root });
  try {
    for (const url of ['/', '/index.html', '/logo.png', '/site.webmanifest']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['cache-control'], 'public, max-age=0, must-revalidate');
    }
    for (const url of ['/main-ABC12345.js', '/styles-DEADBEEF.css']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.headers['cache-control'], 'public, max-age=31536000');
    }
    const previous = await app.inject({ method: 'GET', url: '/logo.png' });
    await writeFile(join(root, 'logo.png'), 'updated artwork revision');
    const updated = await app.inject({
      method: 'GET',
      url: '/logo.png',
      headers: { 'if-none-match': previous.headers.etag! },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body, 'updated artwork revision');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
