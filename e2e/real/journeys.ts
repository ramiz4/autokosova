import { expect, type Page, type Request, type Response } from '@playwright/test';
import type { OwnAccount } from '../../src/shared/account';
import { realFailureStages } from '../../scripts/e2e/real-policy.mjs';
import { realConfiguration } from '../../scripts/e2e/real-config.mjs';
import { api, card, inquiryAction, readyInquiries } from '../support/journeys';

export async function signIn(
  page: Page,
  config: ReturnType<typeof realConfiguration>,
  account: ReturnType<typeof realConfiguration>['accounts'][number],
) {
  await page.goto(config.origin + '/auth/login?locale=de');
  await page.waitForURL((url) => url.origin === config.loginOrigin);
  // Exact-origin checks precede both input and submission; no cross-origin credentials.
  const username = page.locator(config.usernameSelector);
  await expect(username).toHaveCount(1);
  if (new URL(page.url()).origin !== config.loginOrigin) throw new Error('Unexpected login origin');
  await username.fill(account.login!);
  if (new URL(page.url()).origin !== config.loginOrigin) throw new Error('Unexpected login origin');
  await username.locator('xpath=ancestor::form').locator(config.submitSelector).click();
  const password = page.locator(config.passwordSelector);
  await expect(password).toBeVisible();
  if (new URL(page.url()).origin !== config.loginOrigin)
    throw new Error('Unexpected password origin');
  await password.fill(account.password!);
  if (new URL(page.url()).origin !== config.loginOrigin)
    throw new Error('Unexpected password origin');
  await password.locator('xpath=ancestor::form').locator(config.submitSelector).click();
  // MFA/challenges are never disabled or bypassed; approved headed runs may complete them manually.
  await page.waitForURL(
    (url) => url.origin === config.origin && !url.pathname.startsWith('/auth/'),
    { timeout: 90_000 },
  );
  const identity = await (await api(page, config.origin, '/api/me')).json();
  expect(identity.userId).toBe(account.subject);
  expect(identity.accountType).toBe(account.kind);
  expect(identity.roles).toEqual(['customer']);
}

export async function checkProfile(page: Page, origin: string, kind: 'customer' | 'garage') {
  const response = await api(page, origin, '/api/me');
  expect(response.status()).toBe(200);
  const identity: OwnAccount = await response.json();
  expect(identity.profileStatus).toBe('ready');
  expect(identity.roles).toEqual(['customer']);
  expect(identity.accountType).toBe(kind);
  if (kind === 'customer') expect(identity.garageMemberships).toHaveLength(0);
  else {
    expect(identity.garageMemberships.length).toBeGreaterThan(0);
    for (const membership of identity.garageMemberships) {
      expect(membership.role).toBe('owner');
      expect((await api(page, origin, '/api/garages/' + membership.garageId)).status()).toBe(200);
    }
  }
  await page.goto(origin + '/profile');
  await expect(page.locator('[data-account-profile-error]')).toHaveCount(0);
  await page.locator('[data-account-details] summary').click();
  // Compare the actually delivered values, not hard-coded personal data or Subject-as-name fallbacks.
  for (const [field, selector] of [
    ['displayName', '[data-account-display-name-field]'],
    ['email', '[data-account-email]'],
    ['username', '[data-account-username]'],
  ] as const) {
    expect(typeof identity[field]).toBe('string');
    expect(identity[field]!.length).toBeGreaterThan(0);
    await expect(page.locator(selector)).toHaveText(identity[field]!);
  }
  await page.goto(origin + (kind === 'customer' ? '/inquiries' : '/garages/new'));
}

export async function toggleInquiry(page: Page, origin: string, id: string) {
  for (const active of [false, true]) {
    await inquiryAction(page, id, 'toggle');
    await expect
      .poll(
        async () =>
          (await (await api(page, origin, '/api/me/repair-requests/' + id)).json()).active,
      )
      .toBe(active);
    await page.reload();
    await readyInquiries(page);
    await expect(
      card(page, id).locator(active ? '[data-inquiry-search]' : '[data-inquiry-search-disabled]'),
    ).toBeVisible();
  }
}

export class LogoutFailure extends Error {
  constructor(readonly stage: string) {
    super('Provider logout did not complete');
    if (!realFailureStages.includes(stage)) throw new Error('Invalid logout failure stage');
  }
}

export async function fullLogout(
  page: Page,
  config: {
    origin: string;
    loginOrigin: string;
    endSessionEndpoint: string;
    logoutConfirmSelector?: string;
  },
  login?: string,
) {
  let endpointSeen = false,
    callbackSeen = false,
    providerRejected = false,
    callbackRejected = false,
    callbackRedirected = false,
    providerRedirected = false,
    navigationFailed = false;
  const endpoint = new URL(config.endSessionEndpoint);
  const observe = (request: Request) => {
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
    const url = new URL(request.url());
    if (url.origin === endpoint.origin && url.pathname === endpoint.pathname) {
      endpointSeen =
        url.searchParams.get('post_logout_redirect_uri') ===
          config.origin + '/auth/logout/callback' && !!url.searchParams.get('state');
    }
    if (endpointSeen && url.origin === config.origin && url.pathname === '/auth/logout/callback')
      callbackSeen = true;
  };
  const response = (response: Response) => {
    const request = response.request();
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
    const url = new URL(response.url());
    if (
      url.origin === endpoint.origin &&
      url.pathname === endpoint.pathname &&
      response.status() >= 400
    )
      providerRejected = true;
    if (url.origin === endpoint.origin && url.pathname === endpoint.pathname) {
      const location = response.headers()['location'];
      if (location) {
        const target = new URL(location, endpoint);
        callbackRedirected =
          target.origin === config.origin && target.pathname === '/auth/logout/callback';
        providerRedirected = target.origin === config.loginOrigin;
      }
    }
    if (
      url.origin === config.origin &&
      url.pathname === '/auth/logout/callback' &&
      response.status() >= 400
    )
      callbackRejected = true;
  };
  const accountSelection = (url: URL) =>
    url.origin === config.loginOrigin && ['/ui/v2/login/logout', '/logout'].includes(url.pathname);
  const failedNavigation = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      navigationFailed = true;
  };
  page.on('requestfailed', failedNavigation);
  page.on('request', observe);
  page.on('response', response);
  try {
    await page.locator('[aria-controls="account-menu"]').click();
    await page
      .locator('#account-menu')
      .getByRole('button', { name: 'Abmelden', exact: true })
      .click();
    if (config.logoutConfirmSelector) {
      const confirmation = page.locator(config.logoutConfirmSelector);
      await expect(confirmation).toBeVisible();
      if (new URL(page.url()).origin !== config.loginOrigin)
        throw new LogoutFailure('logout-return-invalid');
      await confirmation.click();
    } else {
      await page.waitForURL((url) => url.href === config.origin + '/' || accountSelection(url), {
        timeout: 45_000,
      });
      if (accountSelection(new URL(page.url()))) {
        // ZITADEL Login V2 presents one button per session. Select only the account under test.
        // Never click a generic provider button, another account, or a post-logout login link.
        if (!login) throw new LogoutFailure('logout-account-selection');
        const account = page
          .getByRole('button')
          .filter({ has: page.getByText(login, { exact: true }) });
        await expect(account)
          .toHaveCount(1)
          .catch(() => {
            throw new LogoutFailure('logout-account-selection');
          });
        if (!accountSelection(new URL(page.url())))
          throw new LogoutFailure('logout-return-invalid');
        await account.click();
      }
    }
    await page.waitForURL(config.origin + '/', { timeout: 45_000 });
    expect(endpointSeen).toBe(true);
    expect(callbackSeen).toBe(true);
    expect((await api(page, config.origin, '/api/me')).status()).toBe(401);
  } catch (error) {
    if (error instanceof LogoutFailure) throw error;
    throw new LogoutFailure(
      providerRejected
        ? 'logout-provider-rejected'
        : callbackRejected
          ? 'logout-callback-rejected'
          : navigationFailed
            ? 'logout-navigation-failed'
            : !callbackSeen && callbackRedirected
              ? 'logout-redirect-not-followed'
              : !callbackSeen && accountSelection(new URL(page.url()))
                ? 'logout-selection-no-return'
                : !callbackSeen && providerRedirected
                  ? 'logout-provider-page'
                  : !endpointSeen
                    ? 'logout-endpoint-missing'
                    : !callbackSeen
                      ? 'logout-callback-missing'
                      : 'logout-return-invalid',
    );
  } finally {
    page.off('request', observe);
    page.off('response', response);
    page.off('requestfailed', failedNavigation);
  }
}
