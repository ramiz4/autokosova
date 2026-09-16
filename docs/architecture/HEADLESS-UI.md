# Headless UI contract

The Foundation is integrated in `main` through issue #128 / PR #144 (merge
`524659b9dd1f3536d6fa07c21acba1988d03a710`). GitHub issue #128 records the
approved pure Brain line and the narrow, unstyled CDK-menu exception. This
document fixes the resulting application contract; it is not a release or
accessibility acceptance claim for a product widget.

## Approved, exact dependency contract

| Package | Pinned version | Reason |
| --- | --- | --- |
| `@spartan-ng/brain` | `1.4.1` | Approved current Headless primitives. |
| `@angular/cdk` | `22.1.6` | Exact Angular-22-compatible overlay and menu infrastructure. |
| `clsx` | `2.1.1` | Required Brain peer. |
| `tw-animate-css` | `1.4.0` | Required Brain peer; no stylesheet is imported. |

`luxon` is an optional Brain peer and is intentionally not installed. The
lockfile resolves Angular 22.1.6, RxJS 7.8.2 and Tailwind 4.3.3. Brain 1.4.1
declares Angular/CDK/Common/Forms peers `>=21.0.0 <23.0.0`; CDK 22.1.6 declares
Angular Common/Core/Forms/Platform Browser peers `^22.0.0 || ^23.0.0`.

Only `@spartan-ng/brain/dialog`, `alert-dialog`, `overlay`, `popover` and
`collapsible` are allowed Brain entry points. There is no Brain `menu` export:
the only direct CDK UI API allowed is `@angular/cdk/menu` for the Foundation
fixture and issue #137. CDK overlay, layout and a11y infrastructure may be
imported only where required by approved Brain usage.

The architecture test enforces these exact pins and imports. It forbids legacy
`@spartan-ng/ui-*-brain`, all Helm packages and `hlm-*` code, the exported
`hlm-tailwind-preset.css`, foreign theme/reset imports and Angular Material.
No `tw-animate-css` stylesheet is imported.

## Foundation pilot boundary

`/__foundation-ui-pilot` exists only in the
`headless-foundation-pilot` Angular build configuration; the normal production
route table and production bundle contain neither the route nor its lazy entry.
It contains only synthetic labels and no application data, forms or product
workflow. It verifies the real installed APIs rather than copied blueprints:

- Brain Dialog has a labelled modal portal, its own backdrop and normal return
  focus. It disables outside-pointer dismissal so an opened native dialog does
  not accidentally dismiss the portal below it.
- Generic Brain Overlay is nonmodal (`role=null`, no backdrop, no autofocus)
  and sets each trigger `ElementRef` explicitly with `BrnOverlay.setOrigin()`
  before opening. The test measures both the eight-pixel below placement and
  the above fallback at a lower viewport anchor. This is the anchor basis for
  future field/header work; normal Brain Popover is deliberately not used
  because its trigger always announces `aria-haspopup=dialog` and overrides
  the generic position selection.
- Brain Collapsible exposes its real `aria-expanded` and content relationship.
- The unstyled CDK menu uses native buttons, `cdkMenu`, `cdkMenuItem` and
  keyboard focus restore. It is not a product action menu and does not grant a
  broader CDK-widget allowance.

The existing global tokens remain unchanged: `brand #0061ff`, `brand-dark
#0038c9`, `ink #07143e`, `muted #536d98`, `sky-accent #68c6ff` and the Arial
font stack. The existing native inquiry dialog SCSS is untouched.

On the rebased Staff/ZITADEL baseline, the ordinary production initial browser
bundle is 696.70 kB raw / 149.97 kB estimated transfer, below its unchanged
700-kB error budget. The Foundation fixture does not occur in that output; its
131.35-kB raw entry exists only in the explicit test build. The existing 500-kB
initial warning is deliberately not relaxed.

## Product pattern and focus contracts

Use a Brain dialog or alert dialog for a modal interaction. It owns the focus
trap, backdrop and normal restore path; application code owns the accessible
title/description, initial focus, allowed close policy and persistent-trigger
fallback. Product dialogs do not use native `showModal()` paths. Native browser
`beforeunload` remains browser-owned.

Use the generic Brain overlay for a nonmodal panel whose origin or placement
the application controls. Set the local trigger/origin and positions
explicitly, without duplicating portal placement through absolute offset
classes. A nonmodal navigation or link panel is not a menu or dialog: it has
no focus trap or `aria-modal`, and a late `closed` transition must not close a
different panel.

Use direct CDK menu only for a real action menu. Close it before opening a
dialog and restore focus to its persistent trigger or a stable page fallback,
never to a destroyed menu item. Use Brain collapsible for disclosure. Native
select, range, checkbox and details controls remain native where they already
meet the product need.

Async confirmation and dirty-guard callers must await their result. Context
switch, destruction and cancellation before overlay opening settle the pending
promise negatively exactly once; a late response must not mutate a new context
or reopen an overlay.

## Evidence and limits

`npm run test:headless-foundation:browser` builds on the explicit test-only SSR output,
reads the fixture HTML before client execution, then uses Chromium to prove
successful hydration (no page errors), CDK portal anchoring, nonmodal overlay
semantics, Dialog focus restoration, keyboard-driven menu focus/escape return,
Collapsible ARIA state, and a native `:modal` dialog above an open Brain portal.
It uses no screenshot, trace, video, user, credential or database data.
`npm run test:headless-foundation:production` starts the ordinary production
output and proves the fixture marker is unavailable both in SSR and after
client navigation.

The pilot does not migrate product dialogs, popovers, filters or menus. Each
product interaction retains its authorization, form, localization, responsive
and workflow tests. Screen-reader testing and broader visual/reflow coverage
remain separate release evidence.

## CI contract

Pull requests run `verify` and `development-start`. Full browser, provider and
E2E acceptance is scheduled only on `main`: `E2E acceptance` runs
`npm run test:e2e`; `Inquiries browser` runs the inquiry/private-list smokes,
the existing gallery and mobile-navigation smokes, and
`npm run test:dialogs:browser` after installing Chromium. Account, footer,
staff, favourites and OIDC workflows run their named synthetic browser paths.
Scheduled workflows check out the immutable SHA that triggered the run.

The presence of a script, or a future scheduled run, is not passing evidence
for a current change. Record the exact SHA and completed run before treating a
browser, visual or accessibility result as acceptance evidence. Manual
screen-reader and approved synthetic visual comparisons remain separate,
required release evidence.

## Non-negotiable constraints

- No Helm, HLM copies/generators/presets, legacy/modern mixing, Material,
  foreign theme/reset, package-force flags or global custom dialog state/queue.
- Use standalone local imports, signals and OnPush where applicable; preserve
  zoneless SSR/hydration, existing tokens, forms/CVA, URLs, roles, CSRF, RLS
  and revisions.
- The fixture route is not a product API. Do not link it, add product copy or
  turn it into a shared UI abstraction.

## Modal scrolling contract

Product dialogs use the layout-only `app-dialog-panel`, `app-dialog-header`,
`app-dialog-body` and optional `app-dialog-footer` classes from
`src/app/ui/dialog-layout.scss`. The panel is a height-constrained flex column
with hidden overflow. Header and footer do not shrink; only the body has
`min-height: 0` and `overflow-y: auto`, with contained vertical overscroll.
A form between the panel and body/footer uses `app-dialog-form` so its automatic
minimum size cannot move scrolling back to the panel. No sticky header/footer
is needed. A closed native `<dialog>` retains the browser's `display: none`.

Each caller retains its own viewport limit, responsive padding, colors, radii,
semantics and focus/close policy. The profile contact dialog keeps its actions
outside the scrolling draft; the share input and copy action remain together.
The gallery scales its image within the available height instead of scrolling
its full-screen frame. The shared confirmation dialog uses the same fixed
header/footer with a scrollable description; native beforeunload warnings
remain browser-owned. Subsequent Brain migrations must retain this
body-only scrolling contract; these classes add no overlay or focus manager.

After `npm run build`, `npm run test:dialogs:browser` checks all six current
product dialog types with synthetic browser fixtures in DE/SQ/EN at desktop,
mobile and short landscape viewport sizes. It asserts body-only scrolling,
stationary headers/footers, keyboard focus visibility, viewport bounds and
closed native-dialog visibility. It does not contact a workshop or use a real
account, database, screenshot, video or trace. The Inquiries browser workflow
runs this regression alongside the existing workflow tests.
