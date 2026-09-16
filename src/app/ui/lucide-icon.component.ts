import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon, type LucideIcon } from '@lucide/angular';

/** Keeps the reference-only template contract over Lucide v1's SVG renderer. */
@Component({
  selector: 'lucide-icon',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `
    <svg
      [lucideIcon]="name()"
      [strokeWidth]="strokeWidth()"
      class="size-full fill-[var(--lucide-fill,none)]"
      focusable="false"
    />
  `,
})
export class LucideIconComponent {
  readonly name = input.required<LucideIcon>();
  readonly strokeWidth = input(2);
}
