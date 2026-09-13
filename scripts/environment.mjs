import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// Local files are never read by a production process. The caller decides when
// to apply the result; importing this module has no side effects.
export function loadEnvironment(root = process.cwd(), environment = process.env) {
  environment = Object.fromEntries(
    Object.entries(environment).filter(([, value]) => value !== undefined),
  );
  if (environment.NODE_ENV === 'production') return { ...environment };
  let local = {};
  for (const name of ['.env', '.env.local']) {
    try {
      local = { ...local, ...parseEnv(readFileSync(resolve(root, name), 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`${name} konnte nicht gelesen werden.`);
    }
  }
  return { ...local, ...environment };
}
