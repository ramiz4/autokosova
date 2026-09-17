import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import type { LucideIcon } from '@autokosova/icons';

/** Keeps the reference-only template contract over Lucide v1's SVG renderer. */
@Component({
  selector: 'lucide-icon',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `
    <ng-icon
      [svg]="svg()"
      size="100%"
      [strokeWidth]="strokeWidth()"
      class="size-full [&_svg]:size-full [&_svg]:fill-[var(--lucide-fill,none)]"
    />
  `,
})
export class LucideIconComponent {
  readonly name = input.required<LucideIcon>();
  readonly strokeWidth = input(2);
  protected readonly svg = computed(() => {
    const icon = this.name();
    return icon.svg.replace(
      '<svg ',
      `<svg class="lucide lucide-${icon.name} size-full" focusable="false" stroke-width="${this.strokeWidth()}" `,
    );
  });
}
