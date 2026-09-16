import {
  LucideArrowRight,
  LucideCheck,
  LucideClock,
  LucideSearch,
  LucideShieldCheck,
  LucideThumbsUp,
  type LucideIcon,
} from '@lucide/angular';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CATALOG_PLACES } from '../shared/catalog';
import { REPAIR_REQUEST_LIMITS } from '../shared/repair-request';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { BenefitCardComponent } from './ui/benefit-card.component';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { RadiusSliderComponent } from './ui/radius-slider.component';

@Component({
  imports: [
    FormsModule,
    RadiusSliderComponent,
    RouterLink,
    SiteHeaderComponent,
    ButtonDirective,
    LucideIconComponent,
    BenefitCardComponent,
  ],
  templateUrl: './app.html',
})
export class FoundationComponent {
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly CheckIcon: LucideIcon = LucideCheck;
  readonly ClockIcon: LucideIcon = LucideClock;
  readonly SearchIcon: LucideIcon = LucideSearch;
  readonly ShieldCheckIcon: LucideIcon = LucideShieldCheck;
  readonly ThumbsUpIcon: LucideIcon = LucideThumbsUp;

  protected readonly analytics = inject(AnalyticsService);
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly places = CATALOG_PLACES;
  protected placeId = 'xk-pristina';
  protected radiusKm = 20;
  protected searchError = '';

  constructor() {
    this.language.setPage('landing.pageTitle', 'landing.intro');
  }

  protected search(): void {
    if (!this.places.some((place) => place.id === this.placeId)) {
      this.searchError = this.language.t('landing.invalidPlace');
      return;
    }
    if (
      !Number.isInteger(Number(this.radiusKm)) ||
      this.radiusKm < this.limits.minRadiusKm ||
      this.radiusKm > this.limits.maxRadiusKm
    ) {
      this.searchError = this.language.t('home.searchErrorRadius', {
        max: this.limits.maxRadiusKm,
        min: this.limits.minRadiusKm,
      });
      return;
    }
    this.searchError = '';
    this.analytics.track('search_started');
    void this.router.navigate([this.language.link('search')], {
      queryParams: {
        places: `${this.placeId}:${this.radiusKm}`,
      },
    });
  }
}
