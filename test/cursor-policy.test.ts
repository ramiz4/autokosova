import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);
const controls = [
  'app/ui/button.directive.ts',
  'app/search-handoff.component.ts',
  'app/favorite-garage-card.component.html',
];

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = new URL(entry.name, directory);
        return entry.isDirectory() ? sourceFiles(new URL(`${entry.name}/`, directory)) : [path];
      }),
    )
  ).flat();
}

test('production controls use a forbidden cursor when disabled and never a wait cursor', async () => {
  for (const control of controls) {
    const source = await readFile(new URL(control, sourceRoot), 'utf8');
    assert.match(source, /disabled:cursor-not-allowed/);
  }

  for (const path of await sourceFiles(sourceRoot)) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /\bcursor-wait\b|\bcursor\s*:\s*['"]?wait\b/);
  }
});
