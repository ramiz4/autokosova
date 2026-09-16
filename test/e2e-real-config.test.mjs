import assert from 'node:assert/strict';
import test from 'node:test';
import { realConfiguration } from '../scripts/e2e/real-config.mjs';
const fake = {
  AUTOKOSOVA_E2E_REAL: '1',
  E2E_REAL_BASE_URL: 'http://localhost:4200',
  E2E_REAL_ISSUER: 'https://test-provider.example.invalid',
  E2E_REAL_END_SESSION_ENDPOINT: 'https://test-provider.example.invalid/end_session',
  E2E_REAL_GARAGE_LOGIN: 'fake-garage',
  E2E_REAL_GARAGE_PASSWORD: 'not-a-real-password',
  E2E_REAL_GARAGE_SUBJECT: 'fake-garage-id',
  E2E_REAL_CUSTOMER_LOGIN: 'fake-customer',
  E2E_REAL_CUSTOMER_PASSWORD: 'not-a-real-password',
  E2E_REAL_CUSTOMER_SUBJECT: 'fake-customer-id',
};
test('real integration is explicit, local, distinct-account and credential-safe by default', () => {
  assert.equal(realConfiguration(fake).accounts.length, 2);
  for (const patch of [
    { AUTOKOSOVA_E2E_REAL: '' },
    { E2E_REAL_GARAGE_PASSWORD: '' },
    { E2E_REAL_BASE_URL: 'https://production.example.invalid' },
    { E2E_REAL_ISSUER: 'http://test-provider.example.invalid' },
    { E2E_REAL_CUSTOMER_SUBJECT: fake.E2E_REAL_GARAGE_SUBJECT },
  ])
    assert.throws(() => realConfiguration({ ...fake, ...patch }));
});
