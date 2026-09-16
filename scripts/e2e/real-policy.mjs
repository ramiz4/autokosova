import { processEnvironment } from './policy.mjs';
import { realConfiguration } from './real-config.mjs';

export const credentialKeys = ['CUSTOMER', 'GARAGE'].flatMap((kind) =>
  ['LOGIN', 'PASSWORD', 'SUBJECT'].map((field) => `E2E_REAL_${kind}_${field}`),
);

export const providerKeys = [
  'ZITADEL_ISSUER',
  'ZITADEL_CLIENT_ID',
  'ZITADEL_AUDIENCE',
  'ZITADEL_JWKS_URI',
  'ZITADEL_AUTHORIZATION_ENDPOINT',
  'ZITADEL_TOKEN_ENDPOINT',
  'ZITADEL_USERINFO_ENDPOINT',
  'ZITADEL_REDIRECT_URI',
  'ZITADEL_END_SESSION_ENDPOINT',
  'ZITADEL_POST_LOGOUT_URI',
];
export const browserKeys = [
  'E2E_REAL_BASE_URL',
  'E2E_REAL_ISSUER',
  'E2E_REAL_END_SESSION_ENDPOINT',
  'E2E_REAL_CUSTOMER_LOGIN',
  'E2E_REAL_CUSTOMER_PASSWORD',
  'E2E_REAL_CUSTOMER_SUBJECT',
  'E2E_REAL_GARAGE_LOGIN',
  'E2E_REAL_GARAGE_PASSWORD',
  'E2E_REAL_GARAGE_SUBJECT',
  'E2E_REAL_LOGIN_ORIGIN',
  'E2E_REAL_USERNAME_SELECTOR',
  'E2E_REAL_PASSWORD_SELECTOR',
  'E2E_REAL_SUBMIT_SELECTOR',
  'E2E_REAL_LOGOUT_CONFIRM_SELECTOR',
  'E2E_REAL_HEADED',
];
export const realSteps = [
  'customer-login',
  'customer-profile',
  'customer-create',
  'customer-edit',
  'customer-toggle',
  'garage-login',
  'garage-profile',
  'garage-create',
  'garage-edit',
  'foreign-inquiry',
  'foreign-garage',
  'customer-delete',
  'garage-delete',
  'garage-logout',
  'customer-logout',
  'account-switch',
  'switched-logout',
  'records-cleanup',
  'browser-cleanup',
];
export const pick = (source, keys) =>
  Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
export function browserEnvironment(source) {
  return { ...processEnvironment(source), ...pick(source, browserKeys), AUTOKOSOVA_E2E_REAL: '1' };
}
export function providerEnvironment(source) {
  const config = realConfiguration(source);
  if (providerKeys.some((key) => !source[key]))
    throw new Error('Incomplete test OIDC configuration');
  if (
    new URL(config.origin).protocol !== 'http:' ||
    source.ZITADEL_ISSUER !== config.issuer ||
    source.ZITADEL_CLIENT_ID !== source.ZITADEL_AUDIENCE ||
    source.ZITADEL_REDIRECT_URI !== config.origin + '/auth/callback' ||
    source.ZITADEL_POST_LOGOUT_URI !== config.origin + '/auth/logout/callback' ||
    source.ZITADEL_END_SESSION_ENDPOINT !== config.endSessionEndpoint
  )
    throw new Error('Test client or registered loopback callbacks differ');
  for (const key of [
    'ZITADEL_JWKS_URI',
    'ZITADEL_AUTHORIZATION_ENDPOINT',
    'ZITADEL_TOKEN_ENDPOINT',
    'ZITADEL_USERINFO_ENDPOINT',
  ]) {
    const url = new URL(source[key]);
    if (
      url.protocol !== 'https:' ||
      url.origin !== new URL(config.issuer).origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Test OIDC endpoint differs from issuer');
  }
  return { ...processEnvironment(source), ...pick(source, providerKeys), NODE_ENV: 'test' };
}
export const realFailureStages = [
  'logout-provider-rejected',
  'logout-callback-rejected',
  'logout-endpoint-missing',
  'logout-callback-missing',
  'logout-return-invalid',
  'logout-account-selection',
  'logout-navigation-failed',
  'logout-redirect-not-followed',
  'logout-selection-no-return',
  'logout-provider-page',
];
// Keep failure diagnostics useful without forwarding arbitrary child strings or values.
export function readRealReport(report, expected) {
  if (
    !report ||
    report.mode !== 'real-zitadel' ||
    !['passed', 'failed'].includes(report.status) ||
    !['preflight', 'complete', 'cleanup', ...realSteps, ...realFailureStages].includes(
      report.stage,
    ) ||
    report.commit !== expected.commit ||
    report.nonce !== expected.nonce ||
    report.runId !== expected.runId ||
    report.runAttempt !== expected.runAttempt ||
    !Array.isArray(report.accounts) ||
    ![[], ['customer'], ['customer', 'garage']].some(
      (accounts) => JSON.stringify(accounts) === JSON.stringify(report.accounts),
    ) ||
    !Array.isArray(report.completed) ||
    report.completed.some(
      (step, index) =>
        !realSteps.includes(step) ||
        (index > 0 && realSteps.indexOf(step) <= realSteps.indexOf(report.completed[index - 1])),
    ) ||
    !['passed', 'failed', 'not-run'].includes(report.cleanup) ||
    Object.keys(report).sort().join(',') !==
      'accounts,cleanup,commit,completed,mode,nonce,runAttempt,runId,stage,status'
  )
    throw new Error('Invalid or sensitive real integration evidence');
  return report;
}
export function assertRealReport(report, expected) {
  readRealReport(report, expected);
  if (
    report.status !== 'passed' ||
    report.stage !== 'complete' ||
    JSON.stringify(report.accounts) !== JSON.stringify(['customer', 'garage']) ||
    JSON.stringify(report.completed) !== JSON.stringify(realSteps) ||
    report.cleanup !== 'passed'
  )
    throw new Error('Current complete real integration evidence is missing or unsuccessful');
}
