import {
  LucideArrowRight,
  LucideBadgeCheck,
  LucideHeart,
  LucideInfo,
  LucideMapPin,
  LucideWrench,
  type LucideIcon,
} from '@lucide/angular';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getCatalogPlace } from '../shared/catalog';
import { favoritesCopy, type FavoritesCopyKey } from '../shared/favorites-copy';
import type { FavoriteCard } from './favorite-profiles.service';
import { LanguageService } from './language.service';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { RatingStarsComponent } from './ui/rating-stars.component';

@Component({
  selector: 'app-favorite-garage-card',
  imports: [RouterLink, ButtonDirective, LucideIconComponent, RatingStarsComponent],
  host: { class: 'block min-w-0' },
  templateUrl: './favorite-garage-card.component.html',
})
export class FavoriteGarageCardComponent {
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly BadgeCheckIcon: LucideIcon = LucideBadgeCheck;
  readonly HeartIcon: LucideIcon = LucideHeart;
  readonly InfoIcon: LucideIcon = LucideInfo;
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly WrenchIcon: LucideIcon = LucideWrench;

  readonly card = input.required<FavoriteCard>();
  readonly pending = input(false);
  readonly failed = input(false);
  readonly remove = output<void>();
  readonly retry = output<void>();
  protected readonly language = inject(LanguageService);
  protected readonly failedPhoto = signal<string | null>(null);
  protected readonly photo = computed(() => {
    const garage = this.card().garage;
    return garage?.photoId
      ? `/api/public/garages/${encodeURIComponent(garage.id)}/photos/${encodeURIComponent(garage.photoId)}`
      : null;
  });
  protected placeLabel(): string {
    const id = this.card().garage?.placeId ?? '';
    return getCatalogPlace(id)?.label ?? id;
  }
  protected text(
    key: FavoritesCopyKey,
    replacements: Record<string, string | number> = {},
  ): string {
    let text: string = favoritesCopy[this.language.language][key];
    for (const [name, value] of Object.entries(replacements))
      text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }
  protected ratingLabel(): string {
    const rating = this.card().garage?.rating;
    return rating
      ? this.text('rating', {
          rating: rating.average.toLocaleString(this.language.language, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
          count: rating.count,
        })
      : this.text('noReviews');
  }
}
