// One-time source transfer for this feature branch only. Removed by its own commit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

assert.equal(process.env.GITHUB_REPOSITORY, 'ramiz4/autokosova');
assert.equal(process.env.GITHUB_REF, 'refs/heads/feat/71-my-inquiries');
const base = {
  "src/server/app.ts": "28eb63eb4bad46af7138951fec647fa329a7bbd4",
  "src/server/access.ts": "606c445ef996f408f7204c3a6415d876c1d45e53",
  "src/server/repair-request-store.ts": "157997144782e4402b5b718cbfc61849851bbb66",
  "src/app/app.routes.ts": "f5804f22fc18cd39f6cf73821ac340d7d1934ff2",
  "src/app/language.service.ts": "ff53339951b6faa176af928f17525c786e65707e",
  "src/app/site-header.component.ts": "fe303124edd3eb51d623da62a78e31309ca9f9f7",
  "src/app/site-header.component.html": "954db3e0e089c58d05c062dbef85495f6f830e26",
  "src/server/account-profile.ts": "00daca17dbe6d1b177e0d69f39506b759601a926"
};
const replacements = {
  "src/app/app.routes.ts": [
    [
      "    // Compatibility redirects only; generated links always use English route names.",
      "    {\n      path: `${childPrefix}inquiries`,\n      pathMatch: 'full',\n      loadComponent: () =>\n        import('./inquiries.component').then((module) => module.InquiriesComponent),\n    },\n    // Compatibility redirects only; generated links always use English route names."
    ]
  ],
  "src/app/language.service.ts": [
    ["  | 'profile'\n", "  | 'profile'\n  | 'inquiries'\n"],
    ["    profile: '/profile',", "    profile: '/profile',\n    inquiries: '/inquiries',"],
    ["  if (normalized === '/profile') return { route: 'profile' };", "  if (normalized === '/profile') return { route: 'profile' };\n  if (normalized === '/inquiries') return { route: 'inquiries' };"]
  ],
  "src/app/site-header.component.ts": [
    ["readonly active = input<'garage' | 'search' | 'request' | undefined>();", "readonly active = input<'garage' | 'search' | 'request' | 'inquiries' | undefined>();"]
  ],
  "src/app/site-header.component.html": [
    [
      "        <button\n          type=\"button\"\n          disabled\n          class=\"flex min-h-11 w-full cursor-not-allowed items-center rounded-lg px-2 text-left text-sm text-slate-400\"\n          [title]=\"language.t('nav.privateUnavailable')\"\n        >\n          {{ language.t('nav.myRequests') }}\n        </button>",
      "        @if (account.signedIn()) {\n          <a\n            data-account-inquiries\n            [routerLink]=\"language.link('inquiries')\"\n            (click)=\"closeMenu()\"\n            [attr.aria-current]=\"active() === 'inquiries' ? 'page' : null\"\n            [class.bg-blue-50]=\"active() === 'inquiries'\"\n            class=\"flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-brand-dark hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand\"\n          >\n            {{ language.t('nav.myRequests') }}\n          </a>\n        }"
    ]
  ],
  "src/server/account-profile.ts": [
    ["return /^\\/(?:sq\\/|en\\/)?profile\\/?$/.test(url.split(/[?#]/, 1)[0]);", "return /^\\/(?:sq\\/|en\\/)?(?:profile|inquiries)\\/?$/.test(url.split(/[?#]/, 1)[0]);"]
  ]
};
const added = [
  ".github/workflows/inquiries-browser.yml",
  "db/migrations/071_repair_request_listing.sql",
  "docs/architecture/MY-INQUIRIES.md",
  "scripts/inquiries-browser-smoke.mjs",
  "src/app/inquiries.component.html",
  "src/app/inquiries.component.spec.ts",
  "src/app/inquiries.component.ts",
  "src/app/saved-repair-requests.service.spec.ts",
  "src/app/saved-repair-requests.service.ts",
  "src/server/repair-request-list.ts",
  "src/shared/inquiries-copy.ts",
  "src/shared/saved-repair-request-validation.ts",
  "src/shared/saved-repair-request.ts",
  "test/inquiries-postgres.test.ts",
  "test/inquiries.test.ts"
];
const temporary = ['scripts/prepare-issue-71.mjs', '.github/workflows/prepare-issue-71.yml', '.github/issue-71.patch'];
for (const [path, expected] of Object.entries(base)) {
  const bytes = readFileSync(path);
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(actual, expected, `Unexpected base: ${path}`);
}
for (const path of added) assert.ok(existsSync(path), `Missing feature source: ${path}`);
for (const [path, edits] of Object.entries(replacements)) {
  let content = readFileSync(path, 'utf8');
  for (const [before, after] of edits) {
    assert.equal(content.split(before).length, 2, `Non-unique patch target: ${path}`);
    content = content.replace(before, () => after);
  }
}
const git = (...args) => execFileSync('git', args, { stdio: 'inherit' });
git('apply', '--check', '.github/issue-71.patch');
git('apply', '.github/issue-71.patch');
for (const [path, edits] of Object.entries(replacements)) {
  let content = readFileSync(path, 'utf8');
  for (const [before, after] of edits) content = content.replace(before, () => after);
  writeFileSync(path, content);
}
const paths = [...Object.keys(base), ...added];
execFileSync('npx', ['prettier', '--write', '--ignore-unknown', ...paths], { stdio: 'inherit' });
for (const path of temporary) unlinkSync(path);
git('config', 'user.name', 'github-actions[bot]');
git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
git('add', '--', ...paths, ...temporary);
git('diff', '--cached', '--check');
git('commit', '-m', 'feat(inquiries): integrate owner-only saved request overview (#71)');
git('push', 'origin', 'HEAD:refs/heads/feat/71-my-inquiries');
