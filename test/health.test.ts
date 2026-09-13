import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../src/server/app';

test('health endpoint is available without authentication', async () => {
  const app = createServer();

  try {
    const response = await app.inject({ method: 'GET', url: '/health' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  } finally {
    await app.close();
  }
});
