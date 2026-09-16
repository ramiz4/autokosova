export function realConfiguration(env) {
  if (env.NODE_ENV === 'production') throw new Error('Real tests cannot target production');
  if (env.AUTOKOSOVA_E2E_REAL !== '1')
    throw new Error('Explicit AUTOKOSOVA_E2E_REAL=1 approval is required');
  const required = [
    'E2E_REAL_BASE_URL',
    'E2E_REAL_ISSUER',
    'E2E_REAL_END_SESSION_ENDPOINT',
    'E2E_REAL_GARAGE_LOGIN',
    'E2E_REAL_GARAGE_PASSWORD',
    'E2E_REAL_GARAGE_SUBJECT',
    'E2E_REAL_CUSTOMER_LOGIN',
    'E2E_REAL_CUSTOMER_PASSWORD',
    'E2E_REAL_CUSTOMER_SUBJECT',
  ];
  if (required.some((key) => !env[key]))
    throw new Error('Required real-test runtime configuration is missing');
  const base = new URL(env.E2E_REAL_BASE_URL);
  const issuer = new URL(env.E2E_REAL_ISSUER);
  const login = new URL(env.E2E_REAL_LOGIN_ORIGIN || issuer.origin);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
    !['http:', 'https:'].includes(base.protocol) ||
    base.pathname !== '/' ||
    [base, issuer, login].some((url) => url.username || url.password || url.search || url.hash) ||
    issuer.protocol !== 'https:' ||
    login.protocol !== 'https:' ||
    login.pathname !== '/'
  )
    throw new Error('Real test requires an approved local app and exact HTTPS provider origin');
  if (
    env.E2E_REAL_GARAGE_SUBJECT === env.E2E_REAL_CUSTOMER_SUBJECT ||
    env.E2E_REAL_GARAGE_LOGIN === env.E2E_REAL_CUSTOMER_LOGIN
  )
    throw new Error('Two distinct real test accounts are required');
  const endSession = new URL(env.E2E_REAL_END_SESSION_ENDPOINT);
  if (
    endSession.protocol !== 'https:' ||
    endSession.origin !== issuer.origin ||
    endSession.username ||
    endSession.password ||
    endSession.search ||
    endSession.hash
  )
    throw new Error('An exact HTTPS issuer end-session endpoint is required');
  return {
    issuer: env.E2E_REAL_ISSUER,
    endSessionEndpoint: endSession.href,
    logoutConfirmSelector: env.E2E_REAL_LOGOUT_CONFIRM_SELECTOR,
    origin: base.origin,
    loginOrigin: login.origin,
    usernameSelector:
      env.E2E_REAL_USERNAME_SELECTOR || 'input[name="loginName"], input[name="loginname"]',
    passwordSelector: env.E2E_REAL_PASSWORD_SELECTOR || 'input[type="password"]',
    submitSelector: env.E2E_REAL_SUBMIT_SELECTOR || 'button[type="submit"]',
    headed: env.E2E_REAL_HEADED === '1',
    accounts: ['customer', 'garage'].map((kind) => ({
      kind,
      login: env[`E2E_REAL_${kind.toUpperCase()}_LOGIN`],
      password: env[`E2E_REAL_${kind.toUpperCase()}_PASSWORD`],
      subject: env[`E2E_REAL_${kind.toUpperCase()}_SUBJECT`],
    })),
  };
}
