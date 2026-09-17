# Initial bundle boundaries

The landing page remains eager. Monetization, inquiry creation, garage search and garage profiles use Angular `loadComponent`, as do the existing private routes. Keep feature imports in guards type-only; an ordinary import can pull a lazy page back into the initial graph. URLs, redirects, deactivation guards and SSR footer ownership are unchanged.

The shell imports three small account-navigation labels from `account-navigation-copy.ts`, not the complete staff and review catalogs. Those feature catalogs reuse the same labels. This keeps localization consistent without a registry, extra dependency or runtime fetch.

## Measured result

Production build, Node 24.21.0 and the pinned lockfile, September 17, 2026. The
baseline is merge commit `a9926e1` before Issue #189; the optimized result uses
the same production configuration. Decimal kB; JavaScript and CSS only.

| Metric                                 |        Before |         After |           Difference |
| -------------------------------------- | ------------: | ------------: | -------------------: |
| Initial raw                            |     724.98 kB |     478.21 kB | -246.78 kB (-34.04%) |
| Initial estimated transfer             |     147.55 kB |     120.79 kB |  -26.76 kB (-18.13%) |
| All browser chunks, raw                |   1,555.06 kB |   1,418.83 kB |  -136.23 kB (-8.76%) |
| All browser chunks, estimated transfer |     370.12 kB |     367.01 kB |    -3.10 kB (-0.84%) |

The `stats.json` baseline identified three concrete initial-load costs:

1. The shared initial chunk was 617.45 kB. The Angular Lucide package alone
   contributed 197.87 kB because component metadata for its generated icon
   catalog was hoisted into that shared chunk. The local, typed icon facade now
   uses the already approved `@ng-icons/lucide` SVG data and preserves the
   existing `LucideIcon` references, class names, fill variables and stroke
   widths. This reduced the initial total to 587.01 kB.
2. The always-rendered footer language switcher pulled the CDK/Spartan overlay,
   portal and accessibility stack into the initial graph for a three-link,
   nonmodal menu. A native `details` control retains canonical locale links,
   focus transfer, Escape close behavior and above/below placement without that
   eager overlay dependency. This reduced the initial total to 501.66 kB.
3. The footer's decorative language-chevron was the only remaining eager icon
   user. Rendering that mark with CSS lets the complete icon facade stay with
   the lazy pages and yields the final 478.21 kB result, including the small
   outside-click handler that preserves the previous close behavior.

This is a first-load optimization, not removal of feature functionality. Route
components remain lazy, SSR still prerenders the landing route, and the complete
browser output is smaller as well. Estimated transfer matches Angular's default
Brotli calculation, including its uncompressed treatment of files below 1 KiB.
It is not a deployed HTTP or Core Web Vitals measurement. Branding and other
image assets are excluded from these build metrics.

## Reproduce and protect

```sh
npm run build
node scripts/bundle-report.mjs
node scripts/icons-browser-smoke.mjs
CI=1 npm run verify
```

`npm run build` emits `dist/autokosova/stats.json` outside the served `browser/` directory. The report follows static imports from `src/main.ts` and the styles linked in the built index. Pass saved build directories as arguments to compare revisions, for example `node scripts/bundle-report.mjs /tmp/before-build dist/autokosova`.

The initial budget now warns at 490 kB and fails at 500 kB. This leaves measured
headroom while enforcing the product goal that the production initial bundle
stays below 500 kB. Route regression tests cover all three locales and retain an
eager landing page. The Chromium smoke checks that feature chunks are absent
from landing requests, loads the inquiry via a real client-side click without a
document reload, and checks SSR plus hydration on localized lazy deep links.

References: [Angular route loading strategies](https://angular.dev/guide/routing/loading-strategies), [ng-icons](https://ng-icons.github.io/ng-icons/). The transfer estimator is implemented in the installed `@angular/build/src/tools/esbuild/utils.js`.
