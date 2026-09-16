import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { test, expect } from '../support/application';
import { checkProfile, fullLogout, toggleInquiry } from '../real/journeys';
import { createRealApplication } from '../../scripts/e2e/real-application.mjs';
import { providerKeys, credentialKeys } from '../../scripts/e2e/real-policy.mjs';

// Synthetic harness regression only; never produces real-zitadel acceptance evidence.
test('real-runner-contract checks provider profile and actual end-session traversal, not just local 401', async ({
  app,
  page,
}) => {
  await app.login(page, 'customer');
  await checkProfile(page, app.origin, 'customer');
  await toggleInquiry(page, app.origin, 'demo-request-prishtina-bremsen');
  const config = {
    origin: app.origin,
    loginOrigin: app.provider.environment.ZITADEL_ISSUER,
    endSessionEndpoint: app.provider.environment.ZITADEL_END_SESSION_ENDPOINT,
  };
  await fullLogout(page, config);
  await app.login(page, 'garage');
  await checkProfile(page, app.origin, 'garage');
  // Synthetic hosted Login V2 session selection: another account is deliberately the first button.
  const selectionUrl = config.loginOrigin + '/ui/v2/login/logout';
  let callback = '';
  const endSession = (url: URL) => url.href.startsWith(config.endSessionEndpoint + '?');
  await page.route(endSession, async (route) => {
    const url = new URL(route.request().url());
    const target = new URL(config.origin + '/auth/logout/callback');
    target.searchParams.set('state', url.searchParams.get('state')!);
    callback = target.href;
    await route.fulfill({ status: 302, headers: { location: selectionUrl } });
  });
  await page.route(selectionUrl, async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<button><span>e2e-customer</span></button><button id="own"><span>e2e-garage</span></button>
       <script>document.querySelector('#own').onclick=()=>location.assign(${JSON.stringify(callback)});</script>`,
    });
  });
  await fullLogout(page, config, 'e2e-garage');
  await page.unroute(endSession);
  await page.unroute(selectionUrl);
  await app.login(page, 'garage');
  // A successful local logout and app return must still fail with no visit to the required endpoint.
  await expect(
    fullLogout(page, { ...config, endSessionEndpoint: config.loginOrigin + '/never-visited' }),
  ).rejects.toThrow();
});

test('real-harness-lifecycle starts a built isolated app, binds runtime subjects and removes only its database', async () => {
  const listener = createServer();
  await new Promise<void>((done) => listener.listen(0, 'localhost', done));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const origin = `http://localhost:${address.port}`;
  await new Promise<void>((done) => listener.close(() => done()));
  const issuer = 'https://not-contacted.example.invalid';
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    AUTOKOSOVA_E2E_REAL: '1',
    E2E_REAL_BASE_URL: origin,
    E2E_REAL_ISSUER: issuer,
    ...Object.fromEntries(credentialKeys.map((key) => [key, randomUUID()])),
    ...Object.fromEntries(providerKeys.map((key) => [key, issuer + '/' + key.toLowerCase()])),
    E2E_REAL_END_SESSION_ENDPOINT: issuer + '/end_session',
    ZITADEL_ISSUER: issuer,
    ZITADEL_CLIENT_ID: 'not-contacted-client',
    ZITADEL_AUDIENCE: 'not-contacted-client',
    ZITADEL_REDIRECT_URI: origin + '/auth/callback',
    ZITADEL_POST_LOGOUT_URI: origin + '/auth/logout/callback',
    ZITADEL_END_SESSION_ENDPOINT: issuer + '/end_session',
  };
  const application = await createRealApplication(process.cwd(), environment);
  const control = new pg.Client({ connectionString: process.env['AUTOKOSOVA_E2E_DATABASE_URL'] });
  const url = new URL(process.env['AUTOKOSOVA_E2E_DATABASE_URL']!);
  url.pathname = '/' + application.databaseName;
  const data = new pg.Client({ connectionString: url.href });
  try {
    await control.connect();
    await data.connect();
    const result = await data.query(
      'SELECT account_type, user_id FROM local_demo_account_binding ORDER BY account_type',
    );
    expect(result.rows).toEqual([
      { account_type: 'customer', user_id: environment['E2E_REAL_CUSTOMER_SUBJECT'] },
      { account_type: 'garage', user_id: environment['E2E_REAL_GARAGE_SUBJECT'] },
    ]);
    const response = await fetch(application.origin + '/api/public/search?all=true');
    expect(response.status).toBe(200);
  } finally {
    await data.end();
    await application.close();
    try {
      expect(
        (
          await control.query('SELECT 1 FROM pg_database WHERE datname=$1', [
            application.databaseName,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (await control.query("SELECT 1 FROM pg_database WHERE datname='autokosova'")).rowCount,
      ).toBe(1);
    } finally {
      await control.end();
    }
  }
});
