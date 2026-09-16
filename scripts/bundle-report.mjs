import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

function report(root) {
  const { outputs } = JSON.parse(readFileSync(join(root, 'stats.json'), 'utf8'));
  const initial = new Set();
  function include(file) {
    if (initial.has(file)) return;
    initial.add(file);
    for (const dependency of outputs[file]?.imports ?? []) {
      if (dependency.kind === 'import-statement' && outputs[dependency.path]) {
        include(dependency.path);
      }
    }
  }
  const main = Object.entries(outputs).find(([, info]) => info.entryPoint === 'src/main.ts');
  assert.ok(main, 'The production browser entry must exist in stats.json');
  include(main[0]);
  const html = readFileSync(join(root, 'browser/index.html'), 'utf8');
  for (const match of html.matchAll(/href="([^"/]+\.css)"/g)) initial.add(match[1]);
  const files = readdirSync(join(root, 'browser')).filter((file) => /\.(js|css)$/.test(file));
  const sizes = new Map(
    files.map((file) => {
      const bytes = readFileSync(join(root, 'browser', file));
      // Match Angular's estimator: default Brotli; files below 1 KiB remain uncompressed.
      return [
        file,
        {
          raw: bytes.length,
          estimated: bytes.length < 1024 ? bytes.length : brotliCompressSync(bytes).length,
        },
      ];
    }),
  );
  const sum = (names) =>
    [...names].reduce(
      (total, name) => {
        const size = sizes.get(name);
        assert.ok(size, `Missing browser asset: ${name}`);
        return { raw: total.raw + size.raw, estimated: total.estimated + size.estimated };
      },
      { raw: 0, estimated: 0 },
    );
  return {
    root,
    units: 'bytes',
    initial: sum(initial),
    allBrowserJavaScriptAndCss: sum(files),
    initialFiles: [...initial],
  };
}

// Pass saved build directories to compare revisions without rebuilding either one.
const roots = process.argv.slice(2);
console.log(JSON.stringify((roots.length ? roots : ['dist/autokosova']).map(report), null, 2));
