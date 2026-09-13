import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 4100;
const server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});

async function waitFor(url) {
  const end = Date.now() + 10_000;
  let lastError;

  while (Date.now() < end) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Server did not start: ${String(lastError)}\n${output}`);
}

try {
  const health = await waitFor(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /AutoKosova/);
} finally {
  server.kill('SIGTERM');
}
