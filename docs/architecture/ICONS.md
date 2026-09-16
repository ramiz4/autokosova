# Component-local Lucide icons

Application icons use the exact pinned `@lucide/angular` dependency. Import only the concrete icons a standalone component needs and expose each as a typed `readonly` field. Do not add icon registries, providers, namespace imports, string lookups, or a shared icon barrel.

```ts
import { LucideHouse, type LucideIcon } from '@lucide/angular';
import { LucideIconComponent } from './ui/lucide-icon.component';

// Add LucideIconComponent to the consuming component's imports.
readonly HomeIcon: LucideIcon = LucideHouse;
```

```html
<lucide-icon [name]="HomeIcon" class="size-5 text-brand" />
```

## Library API boundary

Lucide v1 uses `<svg [lucideIcon]="reference">`, not the legacy `<lucide-icon [name]>` selector. The small local `LucideIconComponent` preserves our reference-only template contract and host styling while delegating all SVG rendering to `LucideDynamicIcon`. It contains no icon assets, registry, or mutable global configuration. Its required input accepts `LucideIcon`, not strings.

Sources: [Lucide migration](https://lucide.dev/guide/angular/migration), [reference imports](https://lucide.dev/guide/angular/getting-started), [types](https://lucide.dev/guide/angular/advanced/typescript).

## Styling, state and accessibility

Keep sizing, positioning, responsive visibility, color and transition utilities on `<lucide-icon>`. The renderer fills the host box and uses `currentColor` for strokes. Existing Tailwind v4 theme tokens remain authoritative. No global SVG styling is needed.

Use `[--lucide-fill:currentColor]` for filled stars and `[style.--lucide-fill]="selected() ? 'currentColor' : 'none'"` for favorites. Unset fill defaults to `none`. Fractional ratings retain their clipping containers. The inquiry action menu explicitly retains `[strokeWidth]="4"`; other icons use Lucide's default stroke weight.

Use `computed<LucideIcon>` for state-dependent choices, as in the header menu and favorite notice. Signal-backed row state can select between local references directly. Do not duplicate derived state with effects or manual change detection.

Icons are decorative and unfocusable. Keep accessible names, pressed/expanded state and keyboard behavior on the existing interactive elements. Browser-native select indicators remain native; the previous custom SVG data URI is removed. Branded PNG artwork is not an application icon.

## Regression checks

`npm run test:server` includes the source/TypeScript-AST architecture guard. It rejects legacy SVGs and renderers, global icon providers, string names, namespace imports, and untyped or mutable icon fields. `npm test` covers zoneless updates, independent instances, fill/stroke behavior and account-menu roles/locales.

After `npm run build`, run `node scripts/icons-browser-smoke.mjs` for a real Chromium check of the built SSR application. It creates and cleans up its own loopback server, checks DE/SQ/EN at mobile/desktop widths, verifies SVG/host dimensions and inherited colors, exercises hydrated mobile-menu signal changes, and checks vehicle sizing and fill. It uses only public synthetic pages and does not require a database or real account.

Explicit imports exclude unused icons, but do not imply a smaller bundle than hand-written paths. Review actual production build output; the existing warning and error budgets must not be raised to hide migration costs.
