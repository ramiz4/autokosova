import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { loadEnvironment } from '../environment.mjs';

export function resolveConfig(root, environment = process.env) {
  root = realpathSync(root);
  const env = loadEnvironment(root, environment);
  if (env.NODE_ENV && env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
    throw new Error('Der Entwicklungsstarter erlaubt nur development/test. NODE_ENV prüfen.');
  }
  const identity = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const offset = parseInt(identity.slice(0, 4), 16) % 10000;
  const dbPort = port(env.AUTOKOSOVA_DB_PORT || String(45000 + offset), 'AUTOKOSOVA_DB_PORT');
  const appPort = port(env.AUTOKOSOVA_APP_PORT || '4200', 'AUTOKOSOVA_APP_PORT');
  if (appPort === dbPort) throw new Error('App und DB benötigen unterschiedliche Ports.');
  const databaseUrl = `postgresql://autokosova:autokosova@127.0.0.1:${dbPort}/autokosova`;
  if (env.DATABASE_URL && env.DATABASE_URL !== databaseUrl) {
    throw new Error(
      'DATABASE_URL widerspricht der Worktree-DB. Alten Export entfernen oder AUTOKOSOVA_DB_PORT passend setzen.',
    );
  }
  if (env.DOCKER_HOST || env.DOCKER_TLS_VERIFY || env.DOCKER_CERT_PATH) {
    throw new Error(
      'Docker-Host-/TLS-Overrides sind im lokalen Starter gesperrt. Lokalen Docker-Kontext wählen.',
    );
  }
  const notices = [];
  const oidcKeys = [
    'ZITADEL_AUDIENCE',
    'ZITADEL_AUTHORIZATION_ENDPOINT',
    'ZITADEL_CLIENT_ID',
    'ZITADEL_ISSUER',
    'ZITADEL_JWKS_URI',
    'ZITADEL_REDIRECT_URI',
    'ZITADEL_TOKEN_ENDPOINT',
  ];
  const oidcPresent = oidcKeys.filter((key) => env[key]);
  if (oidcPresent.length !== oidcKeys.length) {
    for (const key of [...oidcKeys, 'ZITADEL_END_SESSION_ENDPOINT', 'ZITADEL_POST_LOGOUT_URI'])
      env[key] = '';
    notices.push(
      'Login nicht konfiguriert; öffentliche Suche verfügbar. Siehe docs/architecture/AUTH-INTEGRATION.md.',
    );
  } else {
    let redirect;
    try {
      redirect = new URL(env.ZITADEL_REDIRECT_URI);
    } catch {
      /* diagnosed below */
    }
    if (!redirect || redirect.href !== `http://localhost:${appPort}/auth/callback`) {
      throw new Error(
        'OIDC-Redirect passt nicht zum App-Port. AUTOKOSOVA_APP_PORT auf den freigegebenen localhost-Callback abstimmen.',
      );
    }
  }
  if (oidcPresent.length === oidcKeys.length) {
    const endpoint = env.ZITADEL_END_SESSION_ENDPOINT;
    const callback = env.ZITADEL_POST_LOGOUT_URI;
    if (!endpoint && !callback) {
      notices.push(
        'Provider-Logout nicht konfiguriert; lokale Abmeldung und erneute Authentifizierung bleiben verfügbar. Siehe AUTH-INTEGRATION.md.',
      );
    } else {
      let valid = false;
      try {
        const end = new URL(endpoint);
        valid =
          callback === `http://localhost:${appPort}/auth/logout/callback` &&
          !end.username &&
          !end.password &&
          !end.hash &&
          !end.search &&
          [
            new URL(env.ZITADEL_ISSUER).origin,
            new URL(env.ZITADEL_AUTHORIZATION_ENDPOINT).origin,
          ].includes(end.origin) &&
          (end.protocol === 'https:' ||
            (end.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '[::1]'].includes(end.hostname)));
      } catch {
        /* fail closed without echoing configuration values */
      }
      if (!valid)
        throw new Error(
          'OIDC-Logout-Konfiguration ungültig oder unvollständig; Endpunkt und registrierten localhost-Logout-Callback prüfen.',
        );
    }
  }
  // Explicit profile selection is the only source of seed permissions here.
  env.AUTOKOSOVA_DEMO_DATA = '';
  env.AUTOKOSOVA_DEMO_WORKFLOW_DATA = '';
  env.ALLOW_LOCAL_RESET = '';
  for (const key of Object.keys(env)) if (key.startsWith('COMPOSE_')) delete env[key];
  Object.assign(env, {
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    AUTOKOSOVA_DB_PORT: String(dbPort),
    AUTOKOSOVA_DEV_WORKTREE: identity,
  });
  return { root, env, identity, project: `autokosova-${identity}`, dbPort, appPort, notices };
}

function port(value, name) {
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535) {
    throw new Error(`${name} muss eine Portnummer zwischen 1024 und 65535 sein.`);
  }
  return Number(value);
}

export function seedEnvironment(env, profile) {
  if (!['reference', 'demo', 'demo-workflows'].includes(profile))
    throw new Error('Unbekanntes Datenprofil.');
  return {
    ...env,
    ...(profile !== 'reference' ? { AUTOKOSOVA_DEMO_DATA: '1' } : {}),
    ...(profile === 'demo-workflows' ? { AUTOKOSOVA_DEMO_WORKFLOW_DATA: '1' } : {}),
  };
}
