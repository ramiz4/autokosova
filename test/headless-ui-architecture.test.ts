import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const sourceExtensions = new Set(['.css', '.html', '.scss', '.ts']);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.'))) ? [path] : [];
    }),
  );
  return files.flat();
}

test('Headless foundation remains blocked and forbids Helm, Material, and unapproved UI imports', async () => {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const dependencyNames = Object.keys(dependencies);
  const lockfile = await readFile(join(root, 'package-lock.json'), 'utf8');

  assert.deepEqual(
    dependencyNames.filter((name) => name.startsWith('@spartan-ng/') || name === '@angular/cdk'),
    [],
    'Issue #128 has no approved Spartan or direct CDK dependency yet',
  );
  assert.deepEqual(
    dependencyNames.filter((name) => name.startsWith('@angular/material')),
    [],
    'Angular Material is outside the Headless foundation',
  );
  assert.equal(
    /node_modules\/@spartan-ng\/(?:helm|ui-[^'"\s]*-helm)(?:[/'"]|$)/.test(lockfile),
    false,
    'the lockfile must not admit a Helm package transitively',
  );

  const files = await sourceFiles('src');
  const forbidden = [
    /@spartan-ng\/(?:helm|ui-[^'"\s]*-helm)(?:[/'"]|$)/,
    /@spartan-ng\/brain\/hlm-tailwind-preset\.css/,
    /@angular\/material(?:[/'"]|$)/,
    /(?:class|className)\s*=\s*["'][^"']*\bhlm-/,
    /@import\s+[^;]*\b(?:helm|preset|reset)\b/i,
  ];

  for (const file of files) {
    const source = await readFile(join(root, file), 'utf8');
    assert.equal(
      /@spartan-ng\/(?:brain|ui-[^'"\s]*)|@angular\/cdk\//.test(source),
      false,
      `${file} must not add an unapproved Headless/CDK import`,
    );
    for (const pattern of forbidden)
      assert.equal(
        pattern.test(source),
        false,
        `${file} violates the Headless UI policy: ${pattern}`,
      );
  }
});
