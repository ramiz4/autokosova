import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AccessStore, AccessError, type Principal } from '../src/server/access';
import { createServer } from '../src/server/app';
import { PostgresGarageOnboardingStore } from '../src/server/garage-onboarding-store';
import { PostgresGarageSearchStore } from '../src/server/garage-search-store';
import { validGarageProfile, type GarageProfileInput } from '../src/shared/garage-onboarding';

const profile: GarageProfileInput = {
  name: 'Fiktive Onboarding-Werkstatt',
  placeId: 'xk-pristina',
  address: 'Fiktive Straße 12, 10000 Prishtina',
  contactPerson: 'Private Testperson',
  contactPhone: '+9990000001',
  languages: ['Deutsch'],
  serviceCategoryIds: ['bremsen'],
  vehicleMakeIds: [],
  selfReportedSpecializations: [],
};
const verified = {
  phone: 'verified',
  contactPerson: 'verified',
  companyDocument: 'verified',
  location: 'verified',
} as const;
function principal(id: string, admin = false): Principal {
  return {
    userId: id,
    roles: new Set(admin ? ['admin'] : ['customer']),
    sessionId: 'test-only',
    csrfToken: 'test-only',
  };
}

test('address and catalogs validate consistently; existing custom labels can be preserved', () => {
  assert.equal(validGarageProfile(profile), true);
  assert.equal(validGarageProfile({ ...profile, address: '10000 Prishtina' }), false);
  assert.equal(
    validGarageProfile({ ...profile, address: 'Zufahrt gegenüber Schule, Prishtinë' }),
    true,
  );
  assert.equal(validGarageProfile({ ...profile, address: 'Fiktive Straße 12, Ferizaj' }), false);
  assert.equal(validGarageProfile({ ...profile, serviceCategoryIds: ['unknown'] }), false);
  assert.equal(
    validGarageProfile({ ...profile, vehicleMakeIds: ['volkswagen', 'volkswagen'] }),
    false,
  );
  assert.equal(validGarageProfile({ ...profile, languages: ['invented'] }), false);
  assert.equal(validGarageProfile({ ...profile, publicWhatsapp: true }), false);
  assert.equal(
    validGarageProfile({ ...profile, publicPhone: '+9990000001', publicWhatsapp: true }),
    true,
  );
  assert.equal(
    validGarageProfile(
      { ...profile, selfReportedSpecializations: ['Custom'] },
      { ...profile, selfReportedSpecializations: ['Custom'] },
    ),
    true,
  );
  assert.equal(
    validGarageProfile({ ...profile, locationPoint: { latitude: Infinity, longitude: 20 } }),
    false,
  );
});

test('API saves address privately, rejects a foreign edit and invalid catalogs, and revokes a location check after an address change', async () => {
  const access = new AccessStore();
  access.addRole('admin', 'admin');
  const owner = access.createSession('owner'),
    foreign = access.createSession('foreign'),
    admin = access.getPrincipal(access.createSession('admin').sessionId)!;
  const app = createServer({ accessStore: access });
  const headers = (session: typeof owner) => ({
    cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
    'x-csrf-token': session.csrfToken,
  });
  try {
    const create = await app.inject({
      method: 'POST',
      url: '/api/garages',
      headers: headers(owner),
      payload: {
        consentVersion: 'v1',
        profile: { ...profile, locationPoint: { latitude: 42.676, longitude: 21.167 } },
      },
    });
    assert.equal(create.statusCode, 201);
    const id = create.json().id;
    const read = await app.inject({
      method: 'GET',
      url: `/api/garages/${id}`,
      headers: headers(owner),
    });
    assert.equal(read.json().profile.address, profile.address);
    assert.match(read.headers['cache-control'] as string, /no-store/);
    const denied = await app.inject({
      method: 'PUT',
      url: `/api/garages/${id}`,
      headers: headers(foreign),
      payload: profile,
    });
    assert.equal(denied.statusCode, 403);
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/garages/${id}`,
      headers: headers(owner),
      payload: { ...profile, serviceCategoryIds: ['fake'] },
    });
    assert.equal(bad.statusCode, 422);
    const own = access.getPrincipal(owner.sessionId)!;
    access.submitGarageForReview(own, id);
    access.reviewGarage(admin, id, 'published', verified);
    const publicProfile = await app.inject({ method: 'GET', url: `/api/public/garages/${id}` });
    assert.equal(publicProfile.statusCode, 200);
    assert.equal(publicProfile.body.includes('Private Testperson'), false);
    assert.equal(publicProfile.body.includes(profile.address!), false);
    const changed = await app.inject({
      method: 'PUT',
      url: `/api/garages/${id}`,
      headers: headers(owner),
      payload: { ...read.json().profile, address: 'Fiktive Straße 99, Prishtina' },
    });
    assert.equal(changed.statusCode, 204);
    assert.equal(access.getPrivateGarage(own, id).verification.location, 'not_checked');
  } finally {
    await app.close();
  }
});

test(
  'PostgreSQL onboarding survives store recreation, keeps ownership, and shares confirmed positions with search',
  { skip: !process.env['DATABASE_URL'] },
  async () => {
    const url = process.env['DATABASE_URL']!,
      suffix = randomUUID(),
      owner = principal('onboarding-owner-' + suffix),
      admin = principal('onboarding-admin-' + suffix, true),
      outsider = principal('onboarding-outsider-' + suffix);
    const role = 'onboarding_test_' + suffix.replaceAll('-', '');
    const restricted = new URL(url);
    restricted.searchParams.set('options', '-c role=' + role);
    let store = new PostgresGarageOnboardingStore(restricted.toString());
    const client = new pg.Client({ connectionString: url });
    const search = new PostgresGarageSearchStore(url);
    const ids: string[] = [];
    await client.connect();
    await client.query(`CREATE ROLE ${role} NOLOGIN`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON app_user, garage, membership, garage_consent, garage_verification, garage_service_category, garage_vehicle_make, moderation_event TO ${role}`,
    );
    await client.query(
      `GRANT SELECT ON public_garage_profile, place, service_category, vehicle_make TO ${role}`,
    );
    try {
      for (const [i, latitude] of [42.67572, 42.68272].entries()) {
        const created = await store.createGarageRegistration(
          owner,
          {
            ...profile,
            name: `Fiktiv ${suffix} ${i}`,
            locationPoint: { latitude, longitude: 21.16688 },
          },
          'v1',
        );
        ids.push(created.id);
      }
      await store.close();
      store = new PostgresGarageOnboardingStore(restricted.toString());
      const restored = await store.getPrivateGarage(owner, ids[0]);
      assert.equal(restored.profile.address, profile.address);
      assert.equal(restored.publicationState, 'draft');
      assert.equal((await store.listOwnedGarages(owner)).length, 2);
      const memberships = await store.listOwnMemberships(owner);
      assert.deepEqual(memberships.map((item) => item.garageId).sort(), [...ids].sort());
      assert.ok(memberships.every((item) => item.role === 'owner' && item.garageName));
      assert.deepEqual(await store.listOwnMemberships(admin), []);
      assert.deepEqual(await store.listOwnMemberships(outsider), []);
      await client.query(
        "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'editor','active',$3)",
        [outsider.userId, ids[1], owner.userId],
      );
      assert.deepEqual(
        (await store.listOwnMemberships(outsider)).map((item) => ({
          garageId: item.garageId,
          role: item.role,
        })),
        [{ garageId: ids[1], role: 'editor' }],
      );
      await client.query(
        "UPDATE membership SET state='revoked' WHERE user_id=$1 AND garage_id=$2",
        [outsider.userId, ids[1]],
      );
      assert.deepEqual(await store.listOwnMemberships(outsider), []);
      await assert.rejects(() => store.updateGarageProfile(outsider, ids[0], profile), AccessError);
      await assert.rejects(
        () => store.reviewGarage(owner, ids[0], 'published', verified),
        AccessError,
      );
      assert.equal(await search.getPublicGarage(ids[0]), undefined);
      for (const id of ids) {
        await store.submitGarageForReview(owner, id);
        await store.reviewGarage(admin, id, 'published', verified);
      }
      const results = await search.searchPublicGarages({
        areas: [{ placeId: 'xk-pristina', radiusKm: 5 }],
        page: 1,
        pageSize: 30,
        serviceCategoryId: 'bremsen',
      });
      const pair = results.results.filter((row) => ids.includes(row.id));
      assert.equal(pair.length, 2);
      assert.notEqual(pair[0].distanceKm, pair[1].distanceKm);
      assert.ok(pair.every((row) => row.distanceKm! > 0));
      await store.updateGarageProfile(owner, ids[0], {
        ...restored.profile,
        address: 'Fiktive Straße 13, Prishtina',
      });
      assert.equal(
        (await store.getPrivateGarage(owner, ids[0])).verification.location,
        'not_checked',
      );
      const after = await search.searchPublicGarages({
        areas: [{ placeId: 'xk-pristina', radiusKm: 5 }],
        page: 1,
        pageSize: 30,
        serviceCategoryId: 'bremsen',
      });
      assert.equal(
        after.results.some((row) => row.id === ids[0]),
        false,
      );
      assert.equal(
        (
          await search.searchPublicGarages({ allResults: true, areas: [], page: 1, pageSize: 30 })
        ).results.some((row) => row.id === ids[0]),
        true,
      );
      await assert.rejects(
        () =>
          store.createGarageRegistration(owner, { ...profile, name: `Fiktiv ${suffix} 1` }, 'v1'),
        AccessError,
      );
      await assert.rejects(
        () =>
          store.createGarageRegistration(
            outsider,
            { ...profile, name: `Fiktiv ${suffix} 1` },
            'v1',
          ),
        AccessError,
      );
      await client.query(
        "UPDATE membership SET state='revoked' WHERE user_id=$1 AND garage_id=$2",
        [owner.userId, ids[0]],
      );
      await assert.rejects(() => store.getPrivateGarage(owner, ids[0]), AccessError);
    } finally {
      for (const table of [
        'garage_service_category',
        'garage_vehicle_make',
        'garage_consent',
        'garage_verification',
        'membership',
      ])
        await client.query(`DELETE FROM ${table} WHERE garage_id=ANY($1::text[])`, [ids]);
      await client.query('DELETE FROM moderation_event WHERE subject_id=ANY($1::text[])', [ids]);
      await client.query('DELETE FROM garage WHERE id=ANY($1::text[])', [ids]);
      await client.query('DELETE FROM app_user WHERE id=ANY($1::text[])', [
        [owner.userId, admin.userId, outsider.userId],
      ]);
      await store.close();
      await search.close();
      await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
      await client.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
      await client.query(`DROP ROLE ${role}`);
      await client.end();
    }
  },
);
