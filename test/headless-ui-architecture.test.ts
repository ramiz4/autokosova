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

test('Headless foundation admits only the approved Brain and CDK menu packages', async () => {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const dependencyNames = Object.keys(dependencies);
  const lockfile = await readFile(join(root, 'package-lock.json'), 'utf8');

  assert.deepEqual(
    dependencyNames
      .filter((name) => name.startsWith('@spartan-ng/') || name === '@angular/cdk')
      .sort(),
    ['@angular/cdk', '@spartan-ng/brain'],
  );
  assert.equal(dependencies['@angular/cdk'], '22.1.6');
  assert.equal(dependencies['@spartan-ng/brain'], '1.4.1');
  assert.equal(dependencies.clsx, '2.1.1');
  assert.equal(dependencies['tw-animate-css'], '1.4.0');
  assert.deepEqual(
    dependencyNames.filter((name) => name.startsWith('@angular/material')),
    [],
    'Angular Material is outside the Headless foundation',
  );
  assert.match(lockfile, /"node_modules\/@angular\/cdk":\s*\{\s*"version": "22\.1\.6"/);
  assert.match(lockfile, /"node_modules\/@spartan-ng\/brain":\s*\{\s*"version": "1\.4\.1"/);
  assert.doesNotMatch(lockfile, /node_modules\/@spartan-ng\/(?:helm|ui-[^'"\s]*-helm)(?:[/'"]|$)/);

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
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('@spartan-ng/') && !specifier.startsWith('@angular/cdk/')) continue;
      assert.match(
        specifier,
        /^@spartan-ng\/brain\/(?:dialog|alert-dialog|overlay|popover|collapsible)$|^@angular\/cdk\/(?:menu|overlay|layout|a11y)$/,
        `${file} imports an unapproved Headless/CDK entry point: ${specifier}`,
      );
    }
    for (const pattern of forbidden)
      assert.equal(
        pattern.test(source),
        false,
        `${file} violates the Headless UI policy: ${pattern}`,
      );
  }

  const pilot = await readFile(
    join(root, 'src/app/headless-foundation-pilot.component.ts'),
    'utf8',
  );
  for (const primitive of [
    'BrnDialog',
    'BrnOverlay',
    'BrnCollapsible',
    'CdkMenu',
    'ChangeDetectionStrategy.OnPush',
  ])
    assert.match(pilot, new RegExp(primitive));
  assert.doesNotMatch(pilot, /@spartan-ng\/brain\/hlm-tailwind-preset\.css|tw-animate-css/);
});
