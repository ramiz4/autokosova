# Headless UI foundation

**Status: IMPLEMENTED PILOT / awaiting review and merge.** GitHub issue #128
records the user approval for the current pure Brain line and the narrow,
unstyled CDK menu exception. This document fixes the resulting contract; it
does not authorize any child issue before this Foundation is reviewed and
integrated into `main`.

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

## Fixture-only pilot

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
child must retain its own authorization, form, localization, responsive and
workflow tests. Screen-reader testing, broader visual/reflow coverage and the
release gate remain work for the named downstream issues after this PR is
reviewed and merged.

## Non-negotiable constraints

- No Helm, HLM copies/generators/presets, legacy/modern mixing, Material,
  foreign theme/reset, package-force flags or global custom dialog state/queue.
- Use standalone local imports, signals and OnPush where applicable; preserve
  zoneless SSR/hydration, existing tokens, forms/CVA, URLs, roles, CSRF, RLS
  and revisions.
- The fixture route is not a product API. Do not link it, add product copy or
  turn it into a shared UI abstraction.
