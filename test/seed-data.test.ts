import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLocalDatabaseTarget,
  assertSeedEnvironment,
  demoWorkshops,
  parseSeedProfile,
} from '../scripts/db/seed-data.mjs';

const localDatabaseUrl = 'postgresql://autokosova:autokosova@127.0.0.1:55432/autokosova';

test('seed profiles are explicit and reject unknown arguments', () => {
  assert.equal(parseSeedProfile([]), 'reference');
  assert.equal(parseSeedProfile(['--profile', 'demo']), 'demo');
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

test('demo fixtures are fiktiv, stable and limited to public profile scenarios', () => {
  assert.equal(new Set(demoWorkshops.map((workshop) => workshop.id)).size, demoWorkshops.length);
  assert.ok(demoWorkshops.every((workshop) => workshop.id.startsWith('demo-')));
  assert.ok(demoWorkshops.every((workshop) => workshop.name.startsWith('DEMO ·')));
  assert.ok(demoWorkshops.every((workshop) => workshop.description.includes('fiktive')));
  assert.ok(demoWorkshops.every((workshop) => workshop.publicPhone.startsWith('+999')));
  assert.ok(demoWorkshops.some((workshop) => workshop.vehicleMakeIds.length === 0));
  assert.ok(demoWorkshops.some((workshop) => workshop.verification === 'not_checked'));
  assert.ok(demoWorkshops.some((workshop) => workshop.languages.includes('Deutsch')));
  assert.ok(demoWorkshops.some((workshop) => workshop.languages.includes('Shqip')));
  assert.ok(demoWorkshops.some((workshop) => workshop.serviceCategoryIds.includes('bremsen')));
  assert.ok(demoWorkshops.some((workshop) => workshop.serviceCategoryIds.includes('klima')));
});
