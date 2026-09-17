import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../src', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const sources = files(root).filter(
  (path) => /\.(ts|html|scss|css)$/.test(path) && !path.endsWith('.spec.ts'),
);

test('application icons have no legacy renderer, hand-written SVG, or string registry', () => {
  for (const path of sources) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /<app-icon\b|\bIconName\b|data:image\/svg\+xml/, path);
    assert.doesNotMatch(
      source,
      /\b(?:provideLucideIcons|provideLucideConfig|LucideAngularModule|LUCIDE_ICONS|LUCIDE_CONFIG)\b/,
      path,
    );
    if (path.includes('/app/') && !path.endsWith('/lucide-icon.component.ts')) {
      assert.doesNotMatch(source, /<(?:svg|path|circle|polygon|polyline|use)\b/, path);
    }
    for (const [tag] of source.matchAll(/<lucide-icon\b[\s\S]*?\/>/g)) {
      assert.match(tag, /\[name\]="/, path);
      assert.doesNotMatch(tag, /\$any\(|(?<!\[)\bname="/, path);
    }
  }
});

test('every concrete icon is explicitly imported and exposed as a typed readonly local reference', () => {
  for (const path of sources.filter((name) => name.endsWith('.ts'))) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const properties: ts.PropertyDeclaration[] = [];
    function visit(node: ts.Node): void {
      if (ts.isPropertyDeclaration(node)) properties.push(node);
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue;
      const module = statement.moduleSpecifier.text;
      assert.notEqual(module, 'lucide-angular', path);
      assert.notEqual(module, '@lucide/angular', path);
      if (module !== '@autokosova/icons') continue;
      const bindings = statement.importClause?.namedBindings;
      assert.ok(bindings && ts.isNamedImports(bindings), `Explicit imports required: ${path}`);
      if (statement.importClause?.isTypeOnly) continue;
      for (const binding of bindings.elements) {
        if (binding.isTypeOnly) continue;
        assert.notEqual(binding.name.text, 'LucideDynamicIcon', path);
        const property = properties.find(
          (member) =>
            member.initializer &&
            ts.isIdentifier(member.initializer) &&
            member.initializer.text === binding.name.text,
        );
        assert.ok(property, `Missing local icon field for ${binding.name.text}: ${path}`);
        assert.match(property.name.getText(source), /Icon$/);
        assert.ok(
          property.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword),
          path,
        );
        assert.equal(property.type?.getText(source), 'LucideIcon', path);
      }
    }
  }
});
