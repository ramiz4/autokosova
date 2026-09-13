import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CATALOG_PLACES, SERVICE_CATEGORY_LABELS } from '../shared/catalog';
import { REPAIR_REQUEST_LIMITS } from '../shared/repair-request';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {}

@Component({
  imports: [FormsModule, RouterLink, LanguageSwitcherComponent],
  templateUrl: './app.html',
})
export class FoundationComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly places = CATALOG_PLACES;
  protected readonly serviceIds = Object.keys(SERVICE_CATEGORY_LABELS);
  protected placeId = 'xk-pristina';
  protected radiusKm = 20;
  protected serviceCategoryId = '';
  protected searchError = '';

  constructor() {
    this.language.setPage('home.title', 'home.intro');
  }

  protected search(): void {
    if (!this.serviceCategoryId) {
      this.searchError = this.language.t('home.searchErrorService');
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
        service: this.serviceCategoryId,
      },
    });
  }

  protected toggleAnalyticsConsent(): void {
    this.analytics.setConsent(!this.analytics.consented);
  }
}
