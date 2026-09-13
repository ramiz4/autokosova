import { mkdir, writeFile, unlink, rmdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function readLock(root) {
  try {
    return await readFile(join(root, '.autokosova-dev.lock', 'owner'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function acquireLock(root) {
  const directory = join(root, '.autokosova-dev.lock');
  try {
    await mkdir(directory);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'Für diesen Worktree besteht eine Startsperre. Laufenden Starter beenden; verwaiste Sperren gemäß README prüfen.',
      );
    throw error;
  }
  try {
    await writeFile(join(directory, 'owner'), `${process.pid}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await rmdir(directory);
    throw error;
  }
  return async () => {
    await unlink(join(directory, 'owner'));
    await rmdir(directory);
  };
}
