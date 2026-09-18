import { isSavedRepairRequest } from '../src/shared/saved-repair-request-validation';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { PostgresGarageOnboardingStore } from '../src/server/garage-onboarding-store';
import { PostgresGarageSearchStore } from '../src/server/garage-search-store';
import { PostgresRepairRequestStore } from '../src/server/repair-request-store';
import { seedDatabase } from '../scripts/db/seed-data.mjs';
import { demoAccountGarageIds, demoAccountRequestIds } from '../scripts/db/demo-accounts.mjs';

const databaseUrl = process.env['DATABASE_URL'];
test(
  'PostgreSQL: subject-bound fixtures support both CRUD flows and survive repeated seeds without resurrection',
  { skip: !databaseUrl },
  async () => {
    assert.notEqual(process.env['NODE_ENV'], 'production');
    const target = new URL(databaseUrl!);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
    const schema = 'demo_accounts_test_' + randomUUID().replaceAll('-', '');
    const root = new pg.Client({ connectionString: databaseUrl });
    await root.connect();
    await root.query(`CREATE SCHEMA ${schema}`);
    target.searchParams.set('options', '-csearch_path=' + schema + ',public');
    const client = new pg.Client({ connectionString: target.toString() });
    const config = {
      AUTOKOSOVA_DEMO_GARAGE_SUBJECT: 'synthetic-garage-' + randomUUID(),
      AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: 'synthetic-customer-' + randomUUID(),
      ZITADEL_ISSUER: 'https://synthetic-oidc.example.test',
    };
    const access = new AccessStore();
    const garage = access.createSession(config.AUTOKOSOVA_DEMO_GARAGE_SUBJECT);
    const customer = access.createSession(config.AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT);
    const outsiderId = 'synthetic-outsider-' + randomUUID();
    const outsider = access.createSession(outsiderId);
    const garageStore = new PostgresGarageOnboardingStore(target.toString());
    const searchStore = new PostgresGarageSearchStore(target.toString());
    const repairRequestStore = new PostgresRepairRequestStore(target.toString());
    const app = createServer({ accessStore: access, garageStore, searchStore, repairRequestStore });
    const headers = (session: typeof garage, revision?: number) => ({
      cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
      'x-csrf-token': session.csrfToken,
      ...(revision === undefined ? {} : { 'if-match': `"${revision}"` }),
    });
    try {
      await client.connect();
      const directory = new URL('../db/migrations/', import.meta.url);
      for (const file of (await readdir(directory))
        .filter((file) => file.endsWith('.sql'))
        .sort()) {
        // Qualify legacy existence checks to this isolated schema; all DDL stays in the test schema.
        const sql = (await readFile(new URL(file, directory), 'utf8')).replaceAll(
          "'public.",
          "'" + schema + '.',
        );
        await client.query(sql);
      }
      // Wrong membership must roll back the complete first-time binding.
      await seedDatabase(client, 'demo', {});
      await client.query("INSERT INTO app_user(id,oidc_subject,status) VALUES($1,$1,'active')", [
        outsiderId,
      ]);
      await client.query(
        "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'owner','active',$1)",
        [outsiderId, demoAccountGarageIds[0]],
      );
      await assert.rejects(() => seedDatabase(client, 'demo', config), /membership/);
      assert.equal((await client.query('SELECT * FROM local_demo_account_binding')).rowCount, 0);
      await client.query('DELETE FROM membership WHERE user_id=$1', [outsiderId]);
      await seedDatabase(client, 'demo', config);
      for (const id of demoAccountRequestIds) {
        const response = await app.inject({
          url: '/api/me/repair-requests/' + id,
          headers: headers(customer),
        });
        assert.equal(
          isSavedRepairRequest(response.json()),
          true,
          'the actual UI must accept every seeded request before any edit',
        );
      }
      // Simulate an already-bound v1 fixture; this was previously visible but not openable.
      await client.query(
        'UPDATE repair_request SET earliest_dropoff_on=NULL,latest_pickup_on=NULL WHERE id=$1',
        [demoAccountRequestIds[0]],
      );
      await seedDatabase(client, 'demo', config);
      const repaired = await app.inject({
        url: '/api/me/repair-requests/' + demoAccountRequestIds[0],
        headers: headers(customer),
      });
      assert.equal(isSavedRepairRequest(repaired.json()), true);
      assert.equal(repaired.json().revision, 2);
      await seedDatabase(client, 'demo', config);
      assert.equal(
        (
          await app.inject({
            url: '/api/me/repair-requests/' + demoAccountRequestIds[0],
            headers: headers(customer),
          })
        ).json().revision,
        2,
      );
      const mine = (await app.inject({ url: '/api/me/garages', headers: headers(garage) })).json();
      assert.deepEqual(
        mine.garages.map((g: { id: string }) => g.id).sort(),
        [...demoAccountGarageIds].sort(),
      );
      assert.equal(
        (await app.inject({ url: '/api/me', headers: headers(garage) })).json().accountType,
        'garage',
      );
      assert.equal(
        (await app.inject({ url: '/api/me', headers: headers(customer) })).json().accountType,
        'customer',
      );
      assert.equal(
        (await app.inject({ url: '/api/me/garages', headers: headers(customer) })).json().garages
          .length,
        0,
      );
      const garageUrl = '/api/garages/' + demoAccountGarageIds[0];
      const first = (await app.inject({ url: garageUrl, headers: headers(garage) })).json();
      assert.equal(first.canDelete, true);
      assert.equal(typeof first.profile.publicWhatsapp, 'boolean');
      const edited = {
        ...first.profile,
        name: 'Bearbeitete fiktive Demo-Werkstatt',
        publicWhatsapp: false,
      };
      assert.equal(
        (
          await app.inject({
            method: 'PUT',
            url: garageUrl,
            headers: headers(garage),
            payload: edited,
          })
        ).statusCode,
        204,
      );
      assert.equal(
        (await app.inject({ method: 'DELETE', url: garageUrl, headers: headers(customer) }))
          .statusCode,
        403,
      );
      await client.query(
        "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'editor','active',$1)",
        [outsiderId, demoAccountGarageIds[0]],
      );
      assert.equal(
        (await app.inject({ method: 'DELETE', url: garageUrl, headers: headers(outsider) }))
          .statusCode,
        403,
      );
      const newGarage = await app.inject({
        method: 'POST',
        url: '/api/garages',
        headers: headers(garage),
        payload: {
          consentVersion: 'test-v1',
          profile: {
            ...edited,
            name: 'Neue fiktive Werkstatt',
            languages: ['Deutsch'],
            selfReportedSpecializations: [],
          },
        },
      });
      assert.equal(newGarage.statusCode, 201, newGarage.body);
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: '/api/garages/' + newGarage.json().id,
            headers: headers(garage),
          })
        ).statusCode,
        204,
      );
      const requestUrl = '/api/me/repair-requests/' + demoAccountRequestIds[0];
      const saved = await app.inject({ url: requestUrl, headers: headers(customer) });
      assert.equal(saved.statusCode, 200);
      assert.equal(isSavedRepairRequest(saved.json()), true);
      assert.equal(
        (await app.inject({ url: requestUrl, headers: headers(garage) })).statusCode,
        404,
      );
      const input = {
        serviceCategoryId: 'bremsen',
        symptom: 'Geänderte fiktive Demo-Anfrage',
        areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
        earliestDropoffOn: '2026-11-02',
        latestPickupOn: '2026-11-06',
      };
      assert.equal(
        (
          await app.inject({
            method: 'PUT',
            url: requestUrl,
            headers: headers(customer, saved.json().revision),
            payload: input,
          })
        ).statusCode,
        200,
      );
      const created = await app.inject({
        method: 'POST',
        url: '/api/me/repair-requests',
        headers: headers(customer),
        payload: input,
      });
      assert.equal(created.statusCode, 201);
      const createdDetail = await app.inject({
        url: '/api/me/repair-requests/' + created.json().id,
        headers: headers(customer),
      });
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: '/api/me/repair-requests/' + created.json().id,
            headers: headers(customer, createdDetail.json().revision),
          })
        ).statusCode,
        204,
      );
      const removedUrl = '/api/me/repair-requests/' + demoAccountRequestIds[1];
      const removed = await app.inject({ url: removedUrl, headers: headers(customer) });
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: removedUrl,
            headers: headers(customer, removed.json().revision),
          })
        ).statusCode,
        204,
      );
      const retainedReviews = (await client.query('SELECT count(*) FROM garage_review')).rows[0]
        .count;
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: '/api/garages/' + demoAccountGarageIds[1],
            headers: headers(garage),
          })
        ).statusCode,
        204,
      );
      for (const profile of ['demo', 'demo', 'demo']) await seedDatabase(client, profile, config);
      assert.equal(
        (await app.inject({ url: garageUrl, headers: headers(garage) })).json().profile.name,
        edited.name,
      );
      assert.equal(
        (await app.inject({ url: requestUrl, headers: headers(customer) })).json().symptom,
        input.symptom,
      );
      const retained = (await app.inject({ url: requestUrl, headers: headers(customer) })).json();
      assert.equal(retained.earliestDropoffOn, input.earliestDropoffOn);
      assert.equal(retained.latestPickupOn, input.latestPickupOn);
      assert.equal(retained.revision, 3);
      assert.equal(
        (await app.inject({ url: removedUrl, headers: headers(customer) })).statusCode,
        404,
      );
      assert.equal(
        (await app.inject({ url: '/api/public/garages/' + demoAccountGarageIds[1] })).statusCode,
        404,
      );
      assert.equal(
        (await app.inject({ url: '/api/me/garages', headers: headers(garage) })).json().garages
          .length,
        1,
      );
      assert.equal(
        (await client.query('SELECT count(*) FROM garage_review')).rows[0].count,
        retainedReviews,
      );
      await assert.rejects(
        () =>
          seedDatabase(client, 'demo', {
            ...config,
            ZITADEL_ISSUER: 'https://other.example.test',
          }),
        /binding differs/,
      );
      const publicResult = (await app.inject({ url: '/api/public/search' })).body;
      assert.ok(!publicResult.includes(config.AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT));
      assert.ok(!publicResult.includes(config.AUTOKOSOVA_DEMO_GARAGE_SUBJECT));
    } finally {
      await app.close();
      await client.end();
      await root.query(`DROP SCHEMA ${schema} CASCADE`);
      await root.end();
    }
  },
);
