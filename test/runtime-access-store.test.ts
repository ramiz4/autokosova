import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createServer } from '../src/server/app';
import { accessStoreForRuntime } from '../src/server/runtime-access-store';

test('keeps an authenticated session through a development module reload only', async () => {
  const instance = `test-${randomUUID()}`;
  const environment = { AUTOKOSOVA_DEV_INSTANCE: instance, NODE_ENV: 'development' };
  const initial = accessStoreForRuntime(environment);
  const session = initial.createSession('reload-fixture');

  const afterReload = accessStoreForRuntime(environment);
  const anotherStarter = accessStoreForRuntime({
    ...environment,
    AUTOKOSOVA_DEV_INSTANCE: `test-${randomUUID()}`,
  });
  const production = accessStoreForRuntime({ ...environment, NODE_ENV: 'production' });

  assert.strictEqual(afterReload, initial);
  assert.equal(afterReload.getPrincipal(session.sessionId)?.userId, 'reload-fixture');
  const app = createServer({ accessStore: afterReload });
  try {
    const account = await app.inject({
      headers: { cookie: `autokosova_session=${session.sessionId}` },
      url: '/api/me',
    });
    assert.equal(account.statusCode, 200);
    assert.equal(account.json().userId, 'reload-fixture');
  } finally {
    await app.close();
  }
  assert.notStrictEqual(anotherStarter, initial);
  assert.equal(anotherStarter.getPrincipal(session.sessionId), undefined);
  assert.notStrictEqual(production, initial);
  assert.equal(production.getPrincipal(session.sessionId), undefined);
});
