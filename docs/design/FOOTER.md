# Shared website footer

Implements issue #65, including its binding clarification that missing internal destinations must be real, clearly provisional pages rather than disabled links.

## Layout and reuse

`SiteFooterComponent` owns the real AutoKosova logo, existing localized slogan, three navigation columns, optional confirmed social profiles, the existing language switcher, copyright and legal navigation. The year comes from `Date`, not a copied design date. Existing optional analytics consent remains reversible and off unless the user explicitly enables it.

`App` renders the footer for ordinary public routes. The garage profile introduced by #66 already places this same component inside its mobile safe-area layout; its route declares `ownsFooter: true`, preventing a second shell footer. Keep this flag only on routes that actually render the shared component. The inquiry's benefit strip is not a footer landmark.

At mobile widths the link columns use a two-column grid and other areas stack/wrap; from the small breakpoint the links use three columns; on desktop brand, navigation and utilities form three horizontal areas. Visible controls have 44px touch targets and focus outlines. The compact native-details language menu opens upward in the footer, supports Tab, and closes with Escape while returning focus to its summary.

## Canonical destinations

German has no prefix; Albanian uses `/sq`; English uses `/en`. All three use these English route names:

| Entry | Canonical path | Content status |
| --- | --- | --- |
| Find garages | `/garages` | Existing public search |
| Create an inquiry | `/inquiry` | Existing inquiry flow |
| Help and contact | `/help` | Provisional |
| Register a garage | `/garages/new` | Existing onboarding |
| Become a partner | `/garages/partners` | Provisional |
| Benefits for garages | `/garages/benefits` | Provisional |
| Our mission | `/about` | Provisional |
| Careers | `/careers` | Provisional |
| Blog | `/blog` | Provisional |
| Privacy | `/privacy` | Provisional; not an approved legal notice |
| Terms | `/terms` | Provisional; not a contract |
| Legal notice | `/imprint` | Provisional; operator details missing |

The router and language switching share `PUBLIC_PAGE_PATHS`. Static garage information pages precede the dynamic garage ID route. Language switching preserves the destination, query and fragment. Navigation signals keep persistent shell links current.

## Required content approvals

The provisional pages have translated notices and `noindex, follow`. They do not submit forms, send messages or create agreements. They must not be represented as approved legal documents.

Privacy requires confirmed controller information, purposes, legal bases, recipients, retention periods and data-subject rights. Terms require approved contracting parties, services and applicable conditions. The legal notice requires the real operator identity, address, contact details and any applicable registration information. Support, partnership, benefits, mission, jobs and editorial content also require owner approval. No example identities, addresses, jobs, contact channels or promises substitute for these inputs.

`OFFICIAL_SOCIAL_LINKS` intentionally remains empty. Until the owner confirms public official URLs, a translated explanatory state is shown. Do not infer handles or link to generic platform homepages. Confirmed links open in a new tab with `noopener noreferrer` and an accessible new-tab notice. No tracking parameters or private contact data belong in this configuration.

## Verification

Use the repository's pinned Node/npm versions and `npm ci` first. Standard checks remain `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:server`, `npm run build` and `npm run test:smoke`.

The footer tests cover canonical links, DE/SQ/EN content, missing social profiles, current copyright year, analytics consent, language-switcher Escape/focus behavior, persistent DOM link updates and one footer across page layouts. Public-page tests check every provisional route, titles, legal warnings and removal of provisional `noindex` on return to home. The SSR smoke test follows all local footer destinations, including localized profile error pages, without creating private requests.

For real layout and keyboard checks after building, run:

```sh
node scripts/footer-browser-smoke.mjs
```

Chrome/Chromium must be installed; `CHROME_BIN` can specify its executable. The script creates its own temporary browser profile and local SSR server, closes only its own processes and removes that profile. No extra browser package or external account is required. The `Footer browser` workflow runs the same script.

The shared footer is checked on the provisional privacy page in DE/SQ/EN at 360, 390, 430, 1280 and 1448 CSS pixels. Assertions cover one footer, overflow/clipping, actual touch-target geometry, column reflow, menu positioning and keyboard focus. Screenshots are written to `test-results/footer/` and retained in the workflow artifact `footer-viewport-screenshots` for seven days. They support human comparison with the issue reference; these checks do not claim pixel-perfect matching or replace a visual review.

See the PR and its Actions runs for commands actually executed and their results. Added tests are not evidence of a successful run until the relevant check has completed.
