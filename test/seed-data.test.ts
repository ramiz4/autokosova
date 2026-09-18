import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLocalDatabaseTarget,
  assertSeedEnvironment,
  demoWorkflowRequests,
  demoWorkflowReviews,
  demoGarages,
  parseSeedProfile,
} from '../scripts/db/seed-data.mjs';

const localDatabaseUrl = 'postgresql://autokosova:autokosova@127.0.0.1:55432/autokosova';

test('seed profiles are explicit and reject unknown arguments', () => {
  assert.equal(parseSeedProfile([]), 'reference');
  assert.equal(parseSeedProfile(['--profile', 'demo']), 'demo');
  assert.equal(parseSeedProfile(['--profile', 'demo-workflows']), 'demo'); // backwards-compat alias
  assert.throws(() => parseSeedProfile(['--profile', 'reference']), /Usage/);
  assert.throws(() => parseSeedProfile(['demo']), /Usage/);
});

test('seed safety only permits the documented local database target', () => {
  assert.doesNotThrow(() => assertLocalDatabaseTarget(localDatabaseUrl));
  assert.throws(
    () => assertLocalDatabaseTarget('postgresql://autokosova:autokosova@example.test/autokosova'),
    /loopback/,
  );
  assert.throws(
    () => assertLocalDatabaseTarget('postgresql://autokosova:autokosova@127.0.0.1/other'),
    /local autokosova database/,
  );
  assert.throws(
    () =>
      assertSeedEnvironment({
        databaseUrl: localDatabaseUrl,
        environment: { NODE_ENV: 'production' },
        profile: 'reference',
      }),
    /prohibited in production/,
  );
  assert.throws(
    () =>
      assertSeedEnvironment({
        databaseUrl: localDatabaseUrl,
        environment: {},
        profile: 'demo',
      }),
    /AUTOKOSOVA_DEMO_DATA=1/,
  );
  assert.doesNotThrow(() =>
    assertSeedEnvironment({
      databaseUrl: localDatabaseUrl,
      environment: { AUTOKOSOVA_DEMO_DATA: '1' },
      profile: 'demo',
    }),
  );
});

test('demo fixtures are stable and limited to public profile scenarios', () => {
  assert.equal(demoGarages.length, 25);
  assert.equal(new Set(demoGarages.map((garage) => garage.id)).size, demoGarages.length);
  // IDs are the stable demo identifiers — names and descriptions are intentionally realistic.
  assert.ok(demoGarages.every((garage) => garage.id.startsWith('demo-')));
  assert.ok(demoGarages.every((garage) => garage.publicPhone.startsWith('+383')));
  assert.ok(demoGarages.every((garage) => garage.publicWhatsapp === true));
  assert.ok(demoGarages.some((garage) => garage.vehicleMakeIds.length === 0));
  assert.ok(demoGarages.some((garage) => garage.verification === 'not_checked'));
  assert.ok(demoGarages.some((garage) => garage.languages.includes('Deutsch')));
  assert.ok(demoGarages.some((garage) => garage.languages.includes('Shqip')));
  assert.ok(demoGarages.some((garage) => garage.serviceCategoryIds.includes('bremsen')));
  assert.ok(demoGarages.some((garage) => garage.serviceCategoryIds.includes('klima')));
});

test('workflow fixtures are explicitly fictional and separate from public demo profiles', () => {
  assert.equal(
    new Set(demoWorkflowReviews.map((review) => review.id)).size,
    demoWorkflowReviews.length,
  );
  assert.equal(
    new Set(demoWorkflowRequests.map((request) => request.id)).size,
    demoWorkflowRequests.length,
  );
  assert.ok(demoWorkflowReviews.every((review) => review.text.length > 20));
  assert.ok(
    demoWorkflowReviews.every((review) =>
      demoGarages.some((garage) => garage.id === review.garageId),
    ),
  );
  assert.ok(demoWorkflowRequests.every((request) => request.symptom.length > 10));
  assert.ok(demoWorkflowRequests.every((request) => request.searchAreas.length > 0));
});
