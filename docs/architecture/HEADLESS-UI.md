# Headless UI foundation — proposed and blocked

**Status: PROPOSED / BLOCKED.** This document records the checked baseline for
GitHub issue #128. It is not an architecture approval, a package allowlist, or
evidence that a Headless UI pilot works. No Spartan or Angular CDK package is a
direct dependency in this revision.

## Scope and decision gate

The original `@spartan-ng/ui-*-brain` package allowlist must remain in force
until the user records an actual decision in issue #128. The proposed modern
variant needs explicit approval for all of the following before any dependency
or application import is added:

1. `@spartan-ng/brain` with an exact version and all required peer versions.
2. Whether direct, unstyled `@angular/cdk/menu` is an allowed exception for
   the menu work; Brain 1.4.1 has no `./menu` export.
3. The exact import/style allowlist and the pilot acceptance evidence.

Choosing the legacy packages, the modern Brain package, or a direct CDK menu
from peer ranges alone is not permitted. The architecture guard deliberately
allows no new Spartan or direct CDK imports while this is blocked.

## Verified package evidence, not a runtime result

On 2026-09-16, the public npm metadata and the published Brain 1.4.1 tarball
were read without installing it in this project:

- `@spartan-ng/brain@1.4.1` declares Angular/CDK/Common/Forms peers
  `>=21.0.0 <23.0.0`, plus `clsx`, `rxjs`, `tailwindcss`, and
  `tw-animate-css`; `luxon` is optional. Peer satisfaction is not a compiled
  or browser compatibility proof.
- The locked application resolves Angular 22.1.6. Public
  `@angular/cdk@22.1.6` metadata declares Angular Common/Core/Forms/Platform
  Browser peers `^22.0.0 || ^23.0.0`, so an exact 22.1.6 CDK candidate is
  compatible at metadata level only.
- Brain exports `./dialog`, `./alert-dialog`, `./overlay`, `./popover` and
  `./collapsible`, but not `./menu`. It also exports
  `./hlm-tailwind-preset.css`; that stylesheet remains prohibited here.
- The published `BrnPopover` overrides connected-position selection and its
  trigger writes `aria-haspopup="dialog"`. Field and header anchors therefore
  require the generic Overlay proposal from the issue, not an assumed generic
  Popover behavior. This still needs rendered-DOM verification.

No Brain or CDK package was added. `npm ci` materialized only dependencies
already pinned in the existing lockfile; it did not compile or render any
Brain API.

## Existing baseline to preserve

The dispatch baseline is `d47fc5a74b5d8c159fdd46cdd3b9bec90c49b904`. Its
global tokens in `src/tailwind.css` are unchanged:

| Token | Value |
| --- | --- |
| `brand` | `#0061ff` |
| `brand-dark` | `#0038c9` |
| `ink` | `#07143e` |
| `muted` | `#536d98` |
| `sky-accent` | `#68c6ff` |
| `font-sans` | `Arial, Helvetica, sans-serif` |

`src/app/inquiry-dialog.scss` contains the current native-dialog contract:
`20px` radius, `min(760px, calc(100vw - 24px))` width, `#07143e85`
backdrop, `0 24px 100px #07143e35` shadow, and sticky header/footer. It is
owned by the dialog children; this Foundation preparation does not migrate it.

The current application uses native `<dialog>` for the inquiry editor and
delete confirmation, plus local application overlay/menu code elsewhere. A
future pilot must verify real SSR/hydration output, CDK portal anchoring,
keyboard behavior, focus restoration, nested overlays, nonmodal semantics,
and native-dialog top-layer interaction. These checks are intentionally not
claimed by this document.

## Non-negotiable constraints

- No `@spartan-ng/*-helm`, `@spartan-ng/helm`, copied/generated `hlm-*`,
  `hlm-tailwind-preset.css`, foreign theme/reset imports, or Angular Material.
- No global UI queue/state, timer-based focus repair, package-generation
  mixing, `--force`, or `--legacy-peer-deps`.
- Local standalone imports only after approval; preserve zoneless SSR and
  hydration, existing tokens, forms, authorization, URLs, and localized copy.
- The architecture guard in `test/headless-ui-architecture.test.ts` is an
  independently useful regression check. When a decision is approved, update
  its explicit allowlist in the same reviewed change before adding imports.
