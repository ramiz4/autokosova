import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAnalyticsStore } from '../src/server/analytics';
import { createServer, isNoIndexPath } from '../src/server/app';
import { localizedServiceLabel, translate } from '../src/shared/i18n';

test('the three UI catalogs keep product strings and catalog labels separate from user content', () => {
  assert.equal(translate('en', 'home.title'), 'Find a suitable garage in Kosovo.');
  assert.equal(translate('sq', 'search.title'), 'Gjej servise');
  assert.equal(localizedServiceLabel('en', 'bremsen'), 'Brakes');
  assert.equal(localizedServiceLabel('sq', 'bremsen'), 'Frenat');
  assert.match(translate('en', 'profile.reviewsOriginal'), /original language/);
});

test('public analytics accepts only aggregate event names and stays disabled by default', async () => {
  const disabledStore = new InMemoryAnalyticsStore();
  const disabledApp = createServer({ analyticsStore: disabledStore });
  try {
    const response = await disabledApp.inject({
      method: 'POST',
      payload: { name: 'search_started' },
      url: '/api/public/analytics/events',
    });
    assert.equal(response.statusCode, 204);
    assert.equal(disabledStore.counts.size, 0);
  } finally {
    await disabledApp.close();
  }

  const store = new InMemoryAnalyticsStore();
  const app = createServer({ analyticsEnabled: true, analyticsStore: store });
  try {
    const accepted = await app.inject({
      method: 'POST',
      payload: { name: 'contact_channel_opened' },
      url: '/api/public/analytics/events',
    });
    const rejectedPayload = await app.inject({
      method: 'POST',
      payload: { name: 'contact_channel_opened', symptom: 'private text' },
      url: '/api/public/analytics/events',
    });
    const bot = await app.inject({
      headers: { 'user-agent': 'Googlebot' },
      method: 'POST',
      payload: { name: 'search_started' },
      url: '/api/public/analytics/events',
    });

    assert.equal(accepted.statusCode, 204);
    // Fastify's closed schema strips an unexpected value before the aggregate-only handler sees
    // it. The request still cannot persist a second field or influence the counter.
    assert.equal(rejectedPayload.statusCode, 204);
    assert.equal(bot.statusCode, 204);
    assert.equal(
      [...store.counts.values()].reduce((total, value) => total + value, 0),
      2,
    );
    assert.equal(JSON.stringify([...store.counts.keys()]).includes('private text'), false);
  } finally {
    await app.close();
  }
});

test('private and parameterized paths are noindex while the sitemap contains public language routes only', async () => {
  const app = createServer({
    publicSiteUrl: 'https://autokosova.example',
    searchStore: {
      listPublicGarageIds: () => ['demo-garage'],
      getPublicGarage: () => undefined,
      searchPublicGarages: () => {
        throw new Error('Not used');
      },
    },
  });
  try {
    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
    const sitemap = await app.inject({ method: 'GET', url: '/sitemap.xml' });
    const privateRequest = await app.inject({ method: 'GET', url: '/en/inquiry' });
    const search = await app.inject({ method: 'GET', url: '/suche?places=xk-pristina:20' });

    assert.equal(robots.statusCode, 200);
    assert.match(robots.body, /Disallow: \/api\//);
    assert.equal(sitemap.statusCode, 200);
    assert.match(sitemap.body, /https:\/\/autokosova\.example\/sq/);
    assert.equal(sitemap.body.includes('/inquiry'), false);
    assert.ok(sitemap.body.includes('/garages/demo-garage'));
    assert.ok(sitemap.body.includes('/sq/garages/demo-garage'));
    assert.ok(!sitemap.body.includes('/garage/'));
    const rules = robots.body.split('\n');
    for (const prefix of ['', '/sq', '/en']) {
      assert.ok(rules.includes(`Disallow: ${prefix}/garages$`));
      assert.ok(!rules.includes(`Disallow: ${prefix}/garages`));
      assert.equal(isNoIndexPath(`${prefix}/garages/demo-garage`), false);
      assert.equal(isNoIndexPath(`${prefix}/inquiry`), true);
      assert.equal(isNoIndexPath(`${prefix}/garages/new`), true);
    }
    assert.equal(privateRequest.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(search.headers['x-robots-tag'], 'noindex, nofollow');
  } finally {
    await app.close();
  }
});
