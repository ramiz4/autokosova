import { Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-rating-stars',
  imports: [IconComponent],
  host: { class: 'inline-flex shrink-0' },
  template: `
    <span class="inline-flex gap-0.5" role="img" [attr.aria-label]="label()">
      @for (star of stars; track star) {
        <span class="relative inline-flex size-4">
          <app-icon name="star" class="size-4 text-slate-200" />
          <span
            class="absolute inset-y-0 left-0 overflow-hidden"
            [style.width.%]="fill(star)"
            aria-hidden="true"
          >
            <app-icon name="star" class="absolute top-0 left-0 size-4 text-amber-500" />
          </span>
        </span>
      }
    </span>
  `,
})
export class RatingStarsComponent {
  readonly label = input.required<string>();
  readonly rating = input.required<number>();
  protected readonly stars = [0, 1, 2, 3, 4] as const;

  protected fill(index: number): number {
    return Math.max(0, Math.min(100, Math.round((this.rating() - index) * 100)));
  }
}
