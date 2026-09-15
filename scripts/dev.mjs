import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveConfig, seedEnvironment } from './dev/config.mjs';
import { inspectDocker } from './dev/docker.mjs';
import { acquireLock, readLock } from './dev/lock.mjs';
import { runProcess, startProcess, waitForApplication, safeLogger } from './dev/process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const controller = new AbortController();
let interrupted = false;
for (const name of ['SIGINT', 'SIGTERM'])
  process.on(name, () => {
    if (interrupted) return;
    interrupted = true;
    controller.abort();
  });
let release;
let app;
try {
  const args = process.argv.slice(2);
  const doctor = args.length === 1 && args[0] === '--doctor';
  const profile =
    args.length === 0 || doctor
      ? 'reference'
      : args.length === 2 && args[0] === '--profile'
        ? args[1]
        : undefined;
  if (!['reference', 'demo', 'demo-workflows'].includes(profile)) {
    throw new Error('Aufruf: npm run dev[:demo|:demo-workflows|:doctor]');
  }
  const config = resolveConfig(root);
  console.log(
    `Worktree: ${config.root}\nProjekt: ${config.project}\nApp-Port: ${config.appPort} · DB-Port: ${config.dbPort}`,
  );
  for (const notice of config.notices) console.log(notice);
  if (await readLock(root)) {
    if (!doctor)
      throw new Error(
        'Für diesen Worktree besteht eine Startsperre. Laufenden Starter beenden; verwaiste Sperren gemäß README prüfen.',
      );
    console.log(
      'Startsperre vorhanden. Laufenden Starter oder verwaiste Sperre gemäß README prüfen.',
    );
  }
  console.log('Prüfe Docker, Worktree-DB und Ports …');
  let docker = await inspectDocker(config, { signal: controller.signal });
  if (doctor) {
    console.log(
      'Diagnose erfolgreich. Keine Ressourcen geändert; API/DB-Bereitschaft wird beim Start geprüft.',
    );
  } else {
    release = await acquireLock(root);
    // Recheck under the lock; a concurrent invocation may have completed setup.
    docker = await inspectDocker(config, { signal: controller.signal });
    console.log('Starte lokale DB …');
    await docker.start();
    const runDb = async (script, args, env) => {
      try {
        await runProcess(process.execPath, [`${root}/scripts/db/${script}.mjs`, ...args], {
          cwd: root,
          env,
          signal: controller.signal,
          timeout: 90000,
        });
      } catch {
        throw new Error(
          `${script === 'migrate' ? 'Migration' : 'Seed'} fehlgeschlagen. DB-Zustand prüfen und den entsprechenden db:-Befehl gezielt ausführen; kein automatischer Reset.`,
        );
      }
    };
    console.log('Prüfe Migrationen …');
    await runDb('migrate', [], config.env);
    console.log(`Bereite Datenprofil ${profile} vor …`);
    await runDb(
      'seed',
      profile === 'reference' ? [] : ['--profile', profile],
      seedEnvironment(config.env, profile),
    );
    controller.signal.throwIfAborted();
    console.log('Starte Angular; prüfe API mit DB-Zugriff …');
    config.env.AUTOKOSOVA_DEV_INSTANCE = randomUUID();
    config.env.AUTOKOSOVA_LOCAL_DEMO_FILES = profile === 'demo-workflows' ? '1' : '0';
    if (profile === 'demo-workflows')
      console.log(
        'Admin-/Moderator-Demo: regulärer OIDC-Login und verifizierte Rollen erforderlich. Fehlende Moderator-Zuordnung: AUTOKOSOVA_DEMO_MODERATOR_SUBJECT lokal einrichten.',
      );
    app = startProcess(
      process.execPath,
      [
        `${root}/node_modules/@angular/cli/bin/ng.js`,
        'serve',
        '--host',
        'localhost',
        '--port',
        String(config.appPort),
      ],
      { cwd: root, env: config.env, log: safeLogger(config.env) },
    );
    const url = `http://localhost:${config.appPort}`;
    await waitForApplication(url, app, {
      signal: controller.signal,
      profile,
      instance: config.env.AUTOKOSOVA_DEV_INSTANCE,
    });
    console.log(
      `Bereit: ${url}/ · Datenprofil: ${profile}\nCtrl+C beendet die App; DB-Daten bleiben erhalten.`,
    );
    await Promise.race([
      app.done.then(() => {
        throw new Error('Angular wurde unerwartet beendet. npm run build zur Diagnose ausführen.');
      }),
      new Promise((resolve) =>
        controller.signal.addEventListener('abort', resolve, { once: true }),
      ),
    ]);
  }
} catch (error) {
  if (!interrupted) console.error(`Start gestoppt: ${error.message}`);
  process.exitCode = interrupted ? 130 : 1;
} finally {
  await app?.stop();
  await release?.();
}
