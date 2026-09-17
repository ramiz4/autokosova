# Component-local Lucide icons

Application icons use the pinned `@ng-icons/lucide` SVG data through the bounded
`@autokosova/icons` facade. Import only the concrete icons a standalone component
needs and expose each as a typed `readonly` field. Do not add runtime registries,
providers, namespace imports or string lookups. Adding a new icon requires an
explicit facade export so the production bundle remains reviewable.

```ts
import { LucideHouse, type LucideIcon } from '@autokosova/icons';
import { LucideIconComponent } from './ui/lucide-icon.component';

// Add LucideIconComponent to the consuming component's imports.
readonly HomeIcon: LucideIcon = LucideHouse;
```

```html
<lucide-icon [name]="HomeIcon" class="size-5 text-brand" />
```

## Library API boundary

The small local `LucideIconComponent` preserves the reference-only template
contract and host styling while delegating safe SVG insertion to `NgIcon`.
`LucideIcon` contains the fixed Lucide name and SVG from the compile-time facade;
callers never pass arbitrary strings or HTML. There is no mutable global icon
configuration. The previous `@lucide/angular` component catalog is intentionally
not a runtime dependency because its generated Angular metadata added about
198 kB to the shared initial chunk.

## Styling, state and accessibility

Keep sizing, positioning, responsive visibility, color and transition utilities on `<lucide-icon>`. The renderer fills the host box and uses `currentColor` for strokes. Existing Tailwind v4 theme tokens remain authoritative. No global SVG styling is needed.

Use `[--lucide-fill:currentColor]` for filled stars and `[style.--lucide-fill]="selected() ? 'currentColor' : 'none'"` for favorites. Unset fill defaults to `none`. Fractional ratings retain their clipping containers. The inquiry action menu explicitly retains `[strokeWidth]="4"`; other icons use Lucide's default stroke weight.

Use `computed<LucideIcon>` for state-dependent choices, as in the header menu and favorite notice. Signal-backed row state can select between local references directly. Do not duplicate derived state with effects or manual change detection.

Icons are decorative and unfocusable. Keep accessible names, pressed/expanded state and keyboard behavior on the existing interactive elements. Browser-native select indicators remain native; the previous custom SVG data URI is removed. Branded PNG artwork is not an application icon.

## Regression checks

`npm run test:server` includes the source/TypeScript-AST architecture guard. It rejects legacy SVGs and renderers, global icon providers, string names, namespace imports, and untyped or mutable icon fields. `npm test` covers zoneless updates, independent instances, fill/stroke behavior and account-menu roles/locales.

After `npm run build`, run `node scripts/icons-browser-smoke.mjs` for a real Chromium check of the built SSR application. It creates and cleans up its own loopback server, checks DE/SQ/EN at mobile/desktop widths, verifies SVG/host dimensions and inherited colors, exercises hydrated mobile-menu signal changes, and checks vehicle sizing and fill. It uses only public synthetic pages and does not require a database or real account.

The production build and `scripts/bundle-report.mjs` remain the source of truth
for bundle size. Issue #189 moved icon data out of the initial graph and tightened
the initial warning/error budgets to 490/500 kB; those limits must not be raised
to hide migration costs.
