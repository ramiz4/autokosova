import { Directive } from '@angular/core';

@Directive({
  selector: '[appActionMenuTrigger]',
  host: {
    class:
      'flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-muted transition-colors hover:bg-blue-100 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-expanded:bg-blue-100 aria-expanded:text-brand disabled:cursor-not-allowed disabled:opacity-60',
  },
})
export class ActionMenuTriggerDirective {}

@Directive({
  selector: '[appActionMenuPanel]',
  host: {
    class:
      'z-50 w-[min(260px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white p-1.5 text-ink shadow-xl shadow-brand/15 ring-0 outline-none focus:outline-none',
  },
})
export class ActionMenuPanelDirective {}

@Directive({
  selector: '[appActionMenuItem]',
  host: {
    class:
      'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-blue-50 focus:bg-blue-50 focus-visible:outline-none data-disabled:pointer-events-none data-disabled:opacity-50 data-[variant=destructive]:text-rose-700 data-[variant=destructive]:hover:bg-rose-50 data-[variant=destructive]:focus:bg-rose-50',
  },
})
export class ActionMenuItemDirective {}

export const ActionMenuImports = [
  ActionMenuTriggerDirective,
  ActionMenuPanelDirective,
  ActionMenuItemDirective,
] as const;
