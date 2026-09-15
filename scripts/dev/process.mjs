import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// This fixture is not assigned to an interactive account. Owned profiles may legitimately
// leave radius search after address edits or deletion; that must not break app startup.
export const DEMO_READINESS_GARAGE_ID = 'demo-prishtina-bremsen-offen';

export function safeLogger(environment, write = (line) => process.stdout.write(line)) {
  const privateValues = Object.entries(environment)
    .filter(
      ([key, value]) =>
        value && /SECRET|TOKEN|PASSWORD|DATABASE_URL|ZITADEL|PRIVATE_KEY|_SUBJECT/i.test(key),
    )
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
  let pending = '';
  return (chunk) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop().slice(-65536);
    for (let line of lines) {
      for (const value of privateValues) line = line.replaceAll(value, '[redacted]');
      write(line.replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s'"]+/g, '[URL]') + '\n');
    }
  };
}

// One process group per command: npm/ng descendants must not survive Ctrl+C.
// Only groups created by this instance are signalled; Docker DBs stay intact.
/**
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, log?: (text: string) => void, shutdownTimeout?: number}} [options]
 */
export function startProcess(
  command,
  args,
  { cwd, env, log = () => {}, shutdownTimeout = 3000 } = {},
) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let finished = false;
  const done = new Promise((resolve) => {
    child.on('error', () => {
      finished = true;
      resolve(-1);
    });
    child.on('close', (code) => {
      finished = true;
      resolve(code ?? -1);
    });
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-1024 * 1024);
      log(chunk.toString());
    });
  function signal(name) {
    if (child.pid) {
      try {
        process.kill(-child.pid, name);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  async function stop() {
    signal('SIGTERM');
    await Promise.race([done, delay(shutdownTimeout, undefined, { ref: false })]);
    // Also kill remaining grandchildren after the group leader has exited.
    signal('SIGKILL');
    await done;
  }
  async function interrupt() {
    signal('SIGINT');
    await Promise.race([done, delay(shutdownTimeout, undefined, { ref: false })]);
    if (!finished) await stop();
  }
  return {
    done,
    get finished() {
      return finished;
    },
    get output() {
      return output;
    },
    interrupt,
    stop,
  };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, log?: (text: string) => void, timeout?: number, signal?: AbortSignal, shutdownTimeout?: number}} [options]
 */
export async function runProcess(command, args, { timeout = 30000, signal, ...options } = {}) {
  signal?.throwIfAborted();
  const child = startProcess(command, args, options);
  let timer;
  let abort;
  const interrupted = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Zeitlimit überschritten.')), timeout);
    abort = () => reject(new Error('Start abgebrochen.'));
    signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    const code = await Promise.race([child.done, interrupted]);
    if (code !== 0) throw new Error(`Befehl fehlgeschlagen (Exit ${code}).`);
    return child.output.trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await child.stop();
  }
}

export async function waitForApplication(
  url,
  child,
  { timeout = 90000, signal, profile = 'reference', instance } = {},
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (child.finished)
      throw new Error(
        'Angular wurde vor der Bereitschaft beendet. npm run build zur Diagnose ausführen.',
      );
    try {
      const response = await fetch(
        `${url}/api/public/search?places=xk-pristina%3A5&service=bremsen&vehicleMake=skoda`,
        {
          signal: AbortSignal.any([AbortSignal.timeout(2000), ...(signal ? [signal] : [])]),
          redirect: 'error',
        },
      );
      const body = await response.json();
      if (
        response.ok &&
        (!instance || response.headers.get('x-autokosova-dev-instance') === instance) &&
        Array.isArray(body.results) &&
        (profile === 'reference' ||
          body.results.some((item) => item.id === DEMO_READINESS_GARAGE_ID))
      )
        return;
    } catch {
      /* Bound retries; never print response bodies or connection details. */
    }
    await delay(200, undefined, { signal });
  }
  throw new Error('API/DB nicht rechtzeitig bereit. npm run dev:doctor und DB-Migrationen prüfen.');
}
