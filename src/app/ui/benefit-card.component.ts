import { type LucideIcon } from '@lucide/angular';
import { Component, input } from '@angular/core';
import { LucideIconComponent } from './lucide-icon.component';

@Component({
  selector: 'app-benefit-card',
  imports: [LucideIconComponent],
  host: { class: 'flex items-center gap-5 lg:gap-7' },
  template: `
    <span
      class="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-blue-50 text-brand-dark lg:size-21"
    >
      <lucide-icon [name]="icon()" class="size-10 lg:size-12" />
    </span>
    <div>
      <h2 class="text-lg font-bold leading-snug tracking-tight text-ink 2xl:text-xl">
        {{ title() }}
      </h2>
      <p class="mt-1 text-sm leading-relaxed text-muted lg:text-base 2xl:text-lg">
        {{ description() }}
      </p>
    </div>
  `,
})
export class BenefitCardComponent {
  readonly icon = input.required<LucideIcon>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();
}
