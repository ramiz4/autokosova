import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface ZitadelVerifierConfig {
  readonly audience: string;
  readonly issuer: string;
  readonly jwksUri: string;
}

export async function verifyZitadelAccessToken(token: string, config: ZitadelVerifierConfig) {
  const verification = await jwtVerify(token, createRemoteJWKSet(new URL(config.jwksUri)), {
    audience: config.audience,
    issuer: config.issuer,
  });

  if (!verification.payload.sub) {
    throw new Error('OIDC token has no subject');
  }

  return { subject: verification.payload.sub };
}
