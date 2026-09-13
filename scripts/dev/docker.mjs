import { createServer } from 'node:net';
import { runProcess } from './process.mjs';

export async function assertFreePort(port, setting, host = '127.0.0.1') {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) resolve();
      else reject(new Error(`Port ${port} ist belegt. ${setting} in .env.local ändern.`));
    });
    server.listen(port, host, () => server.close(resolve));
  });
}

export function assertContainer(container, config) {
  const labels = container.Config?.Labels ?? {};
  const mounts = container.Mounts ?? [];
  const bindings = container.HostConfig?.PortBindings?.['5432/tcp'] ?? [];
  if (
    labels['com.docker.compose.project'] !== config.project ||
    labels['com.docker.compose.service'] !== 'db' ||
    labels['net.autokosova.worktree'] !== config.identity ||
    bindings.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    bindings[0].HostPort !== String(config.dbPort) ||
    !mounts.some(
      (mount) =>
        mount.Type === 'volume' &&
        mount.Name === `${config.project}_postgres-data` &&
        mount.Destination === '/var/lib/postgresql/data',
    )
  ) {
    throw new Error(
      'Docker-DB gehört nicht eindeutig zu diesem Worktree oder Port. Keine Änderung; Compose-Ressourcen prüfen.',
    );
  }
}

export async function inspectDocker(config, { signal, run = runProcess } = {}) {
  const options = { cwd: config.root, env: { ...config.env, DOCKER_CONTEXT: '' }, signal };
  const call = async (args, more = {}) => run('docker', args, { ...options, ...more });
  let endpoint;
  try {
    const context = config.env.DOCKER_CONTEXT || (await call(['context', 'show']));
    endpoint = JSON.parse(
      await call(['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}']),
    );
  } catch {
    throw new Error(
      'Docker-Kontext nicht erreichbar. Docker Desktop/Engine starten und docker context show prüfen.',
    );
  }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('unix:///')) {
    throw new Error(
      'Nur ein lokaler Docker-Unix-Socket ist erlaubt. Lokalen Docker-Kontext wählen.',
    );
  }
  // Bind every subsequent command to the inspected socket, not mutable context defaults.
  const docker = (args, more) => call(['--host', endpoint, ...args], more);
  try {
    if ((await docker(['info', '--format', '{{.OSType}}'])) !== 'linux') throw new Error();
    await docker(['compose', 'version', '--short']);
  } catch {
    throw new Error('Lokale Linux-Docker-Engine oder Compose fehlt. Docker starten/aktualisieren.');
  }
  const compose = (args, more) =>
    docker(
      [
        'compose',
        '--project-directory',
        config.root,
        '--env-file',
        '/dev/null',
        '-f',
        `${config.root}/compose.yaml`,
        '-p',
        config.project,
        ...args,
      ],
      more,
    );
  async function inspect() {
    const ids = (
      await docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${config.project}`])
    )
      .split(/\s+/)
      .filter(Boolean);
    if (ids.length > 1)
      throw new Error(
        'Unerwartete Container im Worktree-Projekt. Keine Änderung; Docker-Ressourcen prüfen.',
      );
    let container;
    if (ids.length) {
      [container] = JSON.parse(await docker(['inspect', ids[0]]));
      assertContainer(container, config);
    }
    const volumes = (
      await docker(['volume', 'ls', '-q', '--filter', `name=^${config.project}_postgres-data$`])
    )
      .split(/\s+/)
      .filter(Boolean);
    if (volumes.length) {
      const [volume] = JSON.parse(await docker(['volume', 'inspect', ...volumes]));
      if (
        volumes.length !== 1 ||
        volume.Name !== `${config.project}_postgres-data` ||
        volume.Labels?.['net.autokosova.worktree'] !== config.identity ||
        volume.Labels?.['com.docker.compose.project'] !== config.project
      ) {
        throw new Error(
          'Vorhandenes DB-Volume gehört nicht eindeutig zum Worktree. Keine Änderung; Volume-Zuordnung prüfen.',
        );
      }
    }
    return container;
  }
  const container = await inspect();
  if (!container?.State.Running) await assertFreePort(config.dbPort, 'AUTOKOSOVA_DB_PORT');
  await assertFreePort(config.appPort, 'AUTOKOSOVA_APP_PORT');
  await assertFreePort(config.appPort, 'AUTOKOSOVA_APP_PORT', '::1');
  return {
    async stop() {
      await inspect();
      await compose(['stop', 'db']);
    },
    async start() {
      await compose(['up', '-d', '--wait', '--wait-timeout', '90', 'db'], { timeout: 180000 });
      const current = await inspect();
      if (!current?.State.Running || current.State.Health?.Status !== 'healthy') {
        throw new Error(
          'Worktree-DB ist nicht gesund. Docker-Status prüfen; Daten bleiben erhalten.',
        );
      }
      const mappings = current.NetworkSettings?.Ports?.['5432/tcp'];
      if (
        !mappings?.some(
          (entry) => entry.HostIp === '127.0.0.1' && entry.HostPort === String(config.dbPort),
        )
      ) {
        throw new Error(
          'Laufender DB-Port stimmt nicht mit dem Worktree überein. Keine Migration ausgeführt.',
        );
      }
    },
  };
}
