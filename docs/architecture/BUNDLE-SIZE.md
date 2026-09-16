# Initial bundle boundaries

The landing page remains eager. Monetization, inquiry creation, garage search and garage profiles use Angular `loadComponent`, as do the existing private routes. Keep feature imports in guards type-only; an ordinary import can pull a lazy page back into the initial graph. URLs, redirects, deactivation guards and SSR footer ownership are unchanged.

The shell imports three small account-navigation labels from `account-navigation-copy.ts`, not the complete staff and review catalogs. Those feature catalogs reuse the same labels. This keeps localization consistent without a registry, extra dependency or runtime fetch.

## Measured result

Production build, Node 24.21.0, pinned lockfile, September 16, 2026. Before: PR #129 commit `f35360e`; after: the lazy-route and shell-copy optimization in the same PR. Decimal kB; JavaScript and CSS only.

| Metric                                 |      Before |       After |           Difference |
| -------------------------------------- | ----------: | ----------: | -------------------: |
| Initial raw                            |   830.47 kB |   663.71 kB | -166.76 kB (-20.08%) |
| Initial estimated transfer             |   177.43 kB |   140.87 kB |  -36.56 kB (-20.60%) |
| All browser chunks, raw                | 1,128.89 kB | 1,130.03 kB |             +1.14 kB |
| All browser chunks, estimated transfer |   255.39 kB |   269.09 kB |            +13.71 kB |

This is a first-load optimization, not removal of feature functionality. Fetching every route eventually costs slightly more because split chunks compress separately and need loading metadata. A cold inquiry route needs 711.71 kB raw / 154.91 kB estimated including its initial dependencies; a cold garage profile needs 735.12 kB / 162.06 kB. Both remain below the former initial bundle.

Estimated transfer matches Angular's default Brotli calculation, including its uncompressed treatment of files below 1 KiB. It is not a measurement of the deployed HTTP response encoding or Core Web Vitals. Branding and other image assets are excluded from these build metrics.

All 38 explicitly imported Lucide icon definitions remain; the icon renderer and styling contract are unchanged. An isolated experiment using `LucideX.icon` / `LucideIconData` measured 830.81 kB raw / 177.32 kB estimated before route splitting, so that change was discarded rather than adding an ineffective abstraction.

## Reproduce and protect

```sh
npm run build
node scripts/bundle-report.mjs
node scripts/icons-browser-smoke.mjs
CI=1 npm run verify
```

`npm run build` emits `dist/autokosova/stats.json` outside the served `browser/` directory. The report follows static imports from `src/main.ts` and the styles linked in the built index. Pass saved build directories as arguments to compare revisions, for example `node scripts/bundle-report.mjs /tmp/before-build dist/autokosova`.

The native initial error budget is tightened from 1 MB to 700 kB; the 500 kB warning remains visible. Route regression tests cover all three locales and retain an eager landing page. The Chromium smoke checks that feature chunks are absent from landing requests, loads the inquiry via a real client-side click without a document reload, and checks SSR plus hydration on twelve localized lazy deep links.

Local verification: 372 Angular tests, 20 development tests, 112 server/architecture tests, and 45 localized SSR smoke pages passed. Eighteen database-dependent tests remain environment-skipped; full authenticated/database-backed acceptance is not claimed by these public-page checks.

References: [Angular route loading strategies](https://angular.dev/guide/routing/loading-strategies), [Lucide Angular reference imports](https://lucide.dev/guide/angular/getting-started). The transfer estimator is implemented in the installed `@angular/build/src/tools/esbuild/utils.js`.
