import { Directive, input } from '@angular/core';

@Directive({
  selector: 'a[appButton],button[appButton]',
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-shape]': 'shape()',
    '[attr.data-size]': 'size()',
    class:
      'inline-flex min-h-13 items-center justify-center gap-3 rounded-xl border border-brand bg-brand px-7 py-3 text-base font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none data-[variant=outline]:border-brand/35 data-[variant=outline]:bg-transparent data-[variant=outline]:text-ink data-[variant=outline]:hover:bg-blue-50 data-[variant=outline-brand]:border-brand data-[variant=outline-brand]:bg-transparent data-[variant=outline-brand]:text-brand data-[variant=outline-brand]:hover:bg-blue-50 data-[shape=pill]:rounded-full data-[size=compact]:min-h-11 data-[size=compact]:rounded-lg data-[size=compact]:px-5 data-[size=compact]:py-2 data-[size=compact]:text-sm',
  },
})
export class ButtonDirective {
  readonly variant = input<'' | 'primary' | 'outline' | 'outline-brand'>('primary', {
    alias: 'appButton',
  });
  readonly shape = input<'rounded' | 'pill'>('rounded');
  readonly size = input<'regular' | 'compact'>('regular');
}
