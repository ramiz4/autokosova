import { spawn } from 'node:child_process';
import pg from 'pg';

if (process.env.ALLOW_LOCAL_RESET !== '1' || process.env.NODE_ENV === 'production') {
  throw new Error('Set ALLOW_LOCAL_RESET=1 for a non-production reset.');
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
} finally {
  await client.end();
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(`${script} failed with ${code}`));
    });
  });
}

await run(new URL('./migrate.mjs', import.meta.url).pathname);
await run(new URL('./seed.mjs', import.meta.url).pathname);
