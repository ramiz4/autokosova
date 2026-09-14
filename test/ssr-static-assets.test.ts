import assert from 'node:assert/strict';
import test from 'node:test';
import { isStaticAssetRequest } from '../src/server/static-asset-path';

test('SSR fallback excludes browser assets from document routes', () => {
  for (const url of ['/main-oldhash.js', '/styles-oldhash.css', '/missing.webp', '/font.woff2']) {
    assert.equal(isStaticAssetRequest(url), true);
  }
  for (const url of ['/garages', '/garages?places=xk-pristina:20', '/garages/demo']) {
    assert.equal(isStaticAssetRequest(url), false);
  }
});
