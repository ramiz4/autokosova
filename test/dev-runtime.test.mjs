import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { assertContainer, assertFreePort, inspectDocker } from '../scripts/dev/docker.mjs';
import {
  runProcess,
  startProcess,
  waitForApplication,
  safeLogger,
  DEMO_READINESS_GARAGE_ID,
} from '../scripts/dev/process.mjs';

const config = {
  project: 'autokosova-test',
  identity: 'test',
  dbPort: 55499,
  appPort: 4299,
  env: {},
  root: '/tmp',
};
function container() {
  return {
    Config: {
      Labels: {
        'com.docker.compose.project': config.project,
        'com.docker.compose.service': 'db',
        'net.autokosova.worktree': 'test',
      },
    },
    HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55499' }] } },
    Mounts: [
      {
        Type: 'volume',
        Name: `${config.project}_postgres-data`,
        Destination: '/var/lib/postgresql/data',
      },
    ],
    State: { Running: true, Health: { Status: 'healthy' } },
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55499' }] } },
  };
}

test('loopback alone is insufficient: container ownership, volume and binding must match', () => {
  assert.doesNotThrow(() => assertContainer(container(), config));
  for (const change of [
    (c) => {
      c.Config.Labels['net.autokosova.worktree'] = 'other';
    },
    (c) => {
      c.Config.Labels['com.docker.compose.project'] = 'other';
    },
    (c) => {
      c.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0';
    },
    (c) => {
      c.HostConfig.PortBindings['5432/tcp'][0].HostPort = '55432';
    },
    (c) => {
      c.Mounts[0].Name = 'foreign-data';
    },
  ]) {
    const c = container();
    change(c);
    assert.throws(() => assertContainer(c, config), /nicht eindeutig/);
  }
});

test('missing Docker and remote contexts fail without a mutating command', async () => {
  for (const endpoint of [undefined, 'ssh://remote', 'tcp://127.0.0.1:2375']) {
    const calls = [];
    await assert.rejects(
      inspectDocker(config, {
        run: async (_, args) => {
          calls.push(args);
          if (endpoint === undefined) throw new Error('missing');
          return args[1] === 'show' ? 'test' : JSON.stringify(endpoint);
        },
      }),
    );
    assert.ok(calls.every((args) => args[0] === 'context'));
  }
});

test('preflight refuses foreign containers before compose up', async () => {
  const calls = [];
  const foreign = container();
  foreign.Config.Labels['net.autokosova.worktree'] = 'other';
  await assert.rejects(
    inspectDocker(config, {
      run: async (_, args) => {
        calls.push(args.join(' '));
        if (args[0] === 'context')
          return args[1] === 'show' ? 'test' : JSON.stringify('unix:///tmp/docker.sock');
        if (args.includes('info')) return 'linux';
        if (args.includes('version')) return '2.39.0';
        if (args.includes('ps')) return 'container-id';
        if (args.includes('inspect')) return JSON.stringify([foreign]);
        throw new Error('unexpected');
      },
    }),
    /nicht eindeutig/,
  );
  assert.ok(calls.every((line) => !line.includes(' up ')));
});

test('process failures do not disclose child output; timeouts and aborts stop children', async () => {
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'console.error("secret-password");process.exit(9)']),
    (error) => /Exit 9/.test(error.message) && !error.message.includes('secret-password'),
  );
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 100 }),
    /Zeitlimit/,
  );
  const controller = new AbortController();
  const pending = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, /abgebrochen/);
});

test('stopping or interrupting a process group also releases a grandchild listening port', async (t) => {
  const child = startProcess(process.execPath, [
    '-e',
    `
    require('node:child_process').spawn(process.execPath, ['-e',
      "require('node:net').createServer().listen(0,'127.0.0.1',function(){console.log(this.address().port)})"], {stdio:'inherit'});
    setInterval(()=>{},1000);
  `,
  ]);
  t.after(() => child.stop());
  const deadline = Date.now() + 5000;
  while (!/\d+/.test(child.output) && Date.now() < deadline) await delay(25);
  const port = Number(child.output.trim());
  assert.ok(port > 0);
  await assert.rejects(assertFreePort(port, 'TEST_PORT'), /belegt/);
  await child.interrupt();
  await assertFreePort(port, 'TEST_PORT');
});

test('readiness requires the search API, valid response and the requested demo record', async (t) => {
  let status = 503;
  let body = { status: 'ok' };
  let instance = 'foreign-starter';
  const server = createServer((request, response) => {
    assert.match(request.url, /^\/api\/public\/search\?/);
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'x-autokosova-dev-instance': instance,
    });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const child = { finished: false };
  await assert.rejects(waitForApplication(url, child, { timeout: 100 }), /API\/DB/);
  status = 200;
  await assert.rejects(waitForApplication(url, child, { timeout: 100 }), /API\/DB/);
  body = { results: [] };
  await waitForApplication(url, child, { timeout: 500 });
  await assert.rejects(
    waitForApplication(url, child, { timeout: 100, profile: 'demo' }),
    /API\/DB/,
  );
  body = { results: [{ id: 'demo-prishtina-bremsen' }] };
  await assert.rejects(
    waitForApplication(url, child, { timeout: 100, profile: 'demo' }),
    /API\/DB/,
  );
  body = { results: [{ id: DEMO_READINESS_GARAGE_ID }] };
  await waitForApplication(url, child, { timeout: 500, profile: 'demo' });
  await waitForApplication(url, child, { timeout: 500, profile: 'demo' });
  await assert.rejects(
    waitForApplication(url, child, { timeout: 100, instance: 'own-starter' }),
    /API\/DB/,
  );
  instance = 'own-starter';
  await waitForApplication(url, child, { timeout: 500, instance });
  await assert.rejects(waitForApplication(url, { finished: true }), /Angular/);
});

test('compiler diagnostics remain visible while split secrets and connection URLs are redacted', () => {
  let output = '';
  const log = safeLogger(
    {
      ZITADEL_CLIENT_ID: 'private-client',
      DATABASE_URL: 'postgresql://user:password@localhost/db',
    },
    (line) => {
      output += line;
    },
  );
  log('Compiler TS7016: missing declaration\nprivate-');
  log('client postgresql://user:password@localhost/db\n');
  assert.match(output, /TS7016/);
  assert.equal(output.includes('private-client'), false);
  assert.equal(output.includes('password'), false);
  assert.match(output, /redacted/);
});

test('readiness fixture stays independent of editable demo-account garages', async () => {
  const { demoGarages } = await import('../db/demo-data.mjs');
  const { demoAccountGarageIds } = await import('../scripts/db/demo-accounts.mjs');
  const fixture = demoGarages.find((garage) => garage.id === DEMO_READINESS_GARAGE_ID);
  assert.ok(fixture);
  assert.equal(demoAccountGarageIds.includes(fixture.id), false);
  assert.equal(fixture.placeId, 'xk-pristina');
  assert.ok(fixture.serviceCategoryIds.includes('bremsen'));
  assert.ok(!fixture.vehicleMakeIds.length || fixture.vehicleMakeIds.includes('skoda'));
  assert.equal(fixture.verification, 'verified');
});

test('development diagnostics redact locally configured demo subjects', () => {
  let output = '';
  const log = safeLogger(
    {
      AUTOKOSOVA_DEMO_GARAGE_SUBJECT: 'fictional-garage-subject',
      AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: 'fictional-customer-subject',
    },
    (line) => {
      output += line;
    },
  );
  log('fictional-garage-subject fictional-customer-subject\n');
  assert.equal(output, '[redacted] [redacted]\n');
});

test('an outer shutdown deadline allows nested process cleanup to finish', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'autokosova-stop-deadline-'));
  const marker = join(directory, 'cleanup-completed');
  const child = startProcess(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { writeFileSync } from 'node:fs';
    let stopping = false;
    process.on('SIGTERM', () => {
      if (stopping) return;
      stopping = true;
      setTimeout(() => {
        writeFileSync(${JSON.stringify(marker)}, 'clean');
        process.exit(0);
      }, 3200);
    });
    setInterval(() => {}, 1000);
    console.log('ready');
  `,
    ],
    { shutdownTimeout: 10000 },
  );
  t.after(async () => {
    await child.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const deadline = Date.now() + 5000;
  while (!child.output.includes('ready') && Date.now() < deadline) await delay(25);
  assert.ok(child.output.includes('ready'));
  await child.stop();
  assert.equal(await child.done, 0);
  assert.equal(await readFile(marker, 'utf8'), 'clean');
});
