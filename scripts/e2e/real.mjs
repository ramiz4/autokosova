import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { realConfiguration } from './real-config.mjs';
import { processEnvironment } from './policy.mjs';

// Opt-in only. This launcher never reads 1Password, local .env files or browser sessions.
try {
  realConfiguration(process.env);
} catch {
  console.error(
    'NOT RUN: real ZITADEL test needs explicit approval and complete runtime configuration. See docs/development/E2E-ACCEPTANCE.md.',
  );
  process.exit(2);
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...processEnvironment(), AUTOKOSOVA_E2E_REAL: '1' };
for (const [key, value] of Object.entries(process.env))
  if (key.startsWith('E2E_REAL_')) env[key] = value;
const child = spawn(process.execPath, ['--import', 'tsx', 'e2e/real/run.ts'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
child.once('error', () => {
  console.error('Real test launcher failed');
  process.exitCode = 1;
});
child.once('close', (code) => {
  process.exitCode = code ?? 1;
});
