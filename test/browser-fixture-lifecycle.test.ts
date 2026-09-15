import assert from 'node:assert/strict';
import test from 'node:test';
import { isCanceledFixtureResponse } from '../scripts/browser-fixture-lifecycle.mjs';

test('only a canceled matching network request explains an invalid CDP interception', () => {
  const canceled = new Set(['canceled-request']);
  const error = { code: -32602, message: 'Invalid InterceptionId.' };
  assert.equal(isCanceledFixtureResponse({ error, networkId: 'canceled-request' }, canceled), true);
  for (const failure of [
    { error, networkId: 'live-request' },
    { error, networkId: undefined },
    { error: { ...error, code: -32000 }, networkId: 'canceled-request' },
    { error: { ...error, message: 'Invalid response code' }, networkId: 'canceled-request' },
    { error: new Error('Chrome command timed out'), networkId: 'canceled-request' },
    { error: undefined, networkId: 'canceled-request' },
  ])
    assert.equal(isCanceledFixtureResponse(failure, canceled), false);
  assert.equal(
    isCanceledFixtureResponse({ error, networkId: 'canceled-request' }, new Set()),
    false,
  );
});

test('navigation may invalidate an interception without a Network cancellation event', () => {
  const error = { code: -32602, message: 'Invalid InterceptionId.' };
  assert.equal(isCanceledFixtureResponse({ error, documentChanged: true }, new Set()), true);
  assert.equal(isCanceledFixtureResponse({ error, documentChanged: false }, new Set()), false);
  assert.equal(
    isCanceledFixtureResponse({ error: new Error('timeout'), documentChanged: true }, new Set()),
    false,
  );
});
