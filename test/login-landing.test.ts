import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import type { GarageOnboardingStore } from '../src/server/garage-onboarding-store';

const cookies = (session: { sessionId: string }) => ({
  cookie: `autokosova_session=${session.sessionId}`,
});

test('landing prioritizes verified staff roles, then account purpose, and ignores client-provided roles and destinations', async () => {
  const store = new AccessStore();
  const customer = store.createSession('landing-customer', undefined, {
    email: 'garage@example.test',
  });
  const owner = store.createSession('landing-owner');
  const admin = store.createSession('landing-admin');
  store.addRole('landing-admin', 'admin');
  const moderator = store.createSession('landing-moderator');
  store.addRole('landing-moderator', 'moderator');
  const both = store.createSession('landing-both');
  store.addRole('landing-both', 'moderator');
  store.addRole('landing-both', 'admin');
  store.addMembership('landing-owner', 'fictional-garage', 'owner');
  store.addMembership('landing-owner', 'fictional-garage', 'owner', 'revoked');
  const app = createServer({ accessStore: store });
  try {
    for (const locale of ['de', 'sq', 'en']) {
      const prefix = locale === 'de' ? '' : '/' + locale;
      for (const [session, path] of [
        [customer, '/inquiries'],
        [owner, '/garages/new'],
        [admin, '/admin'],
        [moderator, '/moderation'],
        [both, '/admin'],
      ] as const) {
        const result = await app.inject({
          url: `/auth/landing?locale=${locale}&role=garage&accountType=garage&returnTo=https://evil.invalid&userId=other`,
          headers: cookies(session),
        });
        assert.equal(result.statusCode, 302);
        assert.equal(result.headers.location, prefix + path);
        assert.equal(result.headers['cache-control'], 'private, no-store');
        assert.equal(result.headers.vary, 'Cookie');
        assert.equal(result.headers['referrer-policy'], 'no-referrer');
        assert.equal(result.headers['x-robots-tag'], 'noindex, nofollow');
        assert.equal(result.cookies.length, 0);
        assert.doesNotMatch(result.body, /landing-owner|landing-customer|evil|sessionId|csrfToken/);
      }
    }
    for (const suffix of [
      '',
      '?locale=fr',
      '?locale=//evil.invalid',
      '?locale=sq&locale=en',
      '?locale=%0d%0aLocation%3Aevil',
    ]) {
      const result = await app.inject({
        url: '/auth/landing' + suffix,
        headers: cookies(customer),
      });
      assert.equal(result.headers.location, '/inquiries');
    }
    assert.equal(store.getAccountType(store.getPrincipal(customer.sessionId)!), 'customer');
    assert.deepEqual([...store.getPrincipal(customer.sessionId)!.roles], ['customer']);
    assert.deepEqual(store.listOwnMemberships(store.getPrincipal(owner.sessionId)!), []);
  } finally {
    await app.close();
  }
});

test('missing, forged or expired sessions use the existing localized profile without a login loop or store read', async () => {
  const store = new AccessStore();
  const expired = store.createSession('expired', new Date(0));
  let reads = 0;
  store.getAccountType = () => {
    reads++;
    throw new Error('must not read');
  };
  const app = createServer({ accessStore: store });
  try {
    for (const locale of ['de', 'sq', 'en']) {
      for (const sessionId of ['', 'forged', expired.sessionId]) {
        const result = await app.inject({
          url: '/auth/landing?locale=' + locale,
          headers: cookies({ sessionId }),
        });
        assert.equal(result.statusCode, 302);
        assert.equal(result.headers.location, (locale === 'de' ? '' : '/' + locale) + '/profile');
      }
    }
    assert.equal(reads, 0);
  } finally {
    await app.close();
  }
});

test('account lookup failure does not guess a customer type or expose database errors', async () => {
  const store = new AccessStore();
  const session = store.createSession('store-failure');
  store.getAccountType = () => {
    throw new Error('PRIVATE-DB-DETAILS');
  };
  const app = createServer({ accessStore: store });
  try {
    const result = await app.inject({ url: '/auth/landing?locale=sq', headers: cookies(session) });
    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.location, '/sq/profile');
    assert.doesNotMatch(result.body, /PRIVATE-DB-DETAILS|store-failure/);
    assert.ok(store.getPrincipal(session.sessionId));
  } finally {
    await app.close();
  }
});

for (const revoke of [true, false]) {
  test(`landing rechecks ${revoke ? 'logout' : 'expiry'} after an asynchronous account lookup`, async () => {
    const store = new AccessStore();
    const expiry = new Date(Date.now() + 60_000);
    const session = store.createSession('pending-account', expiry);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const garageStore: GarageOnboardingStore = store;
    garageStore.getAccountType = async () => {
      entered();
      await waiting;
      return 'garage';
    };
    const app = createServer({ accessStore: store, garageStore });
    try {
      const result = app
        .inject({ url: '/auth/landing?locale=en', headers: cookies(session) })
        .then((response) => response);
      await started;
      if (revoke) store.revokeSession(session.sessionId);
      else expiry.setTime(0);
      release();
      const landing = await result;
      assert.equal(landing.headers.location, '/en/profile');
      assert.equal(landing.cookies.length, 0);
    } finally {
      release();
      await app.close();
    }
  });
}
