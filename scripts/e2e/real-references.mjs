import { pathToFileURL } from 'node:url';
import { providerKeys, credentialKeys } from './real-policy.mjs';

export { credentialKeys } from './real-policy.mjs';
export function assertReferences(source) {
  const vault = source.OP_CI_TEST_VAULT_ID;
  if (!/^[a-z2-7]{26}$/.test(vault || '')) throw new Error('Dedicated CI test vault ID missing');
  for (const key of [...providerKeys, ...credentialKeys, 'E2E_REAL_LOGIN_ORIGIN']) {
    const value = source[key + '_REF'];
    if (key === 'E2E_REAL_LOGIN_ORIGIN' && !value) continue;
    if (
      !value ||
      !value.startsWith(`op://${vault}/`) ||
      !/^op:\/\/[a-z2-7]{26}\/[a-z2-7]{26}\/[^\s?#/]+(?:\/[^\s?#/]+)?$/.test(value)
    )
      throw new Error('Missing or invalid dedicated-vault field reference');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertReferences(process.env);
  } catch {
    console.error(
      'Real ZITADEL prerequisites failed: required dedicated-vault references are missing or invalid',
    );
    process.exitCode = 1;
  }
}
