import { RadiusSliderComponent } from './ui/radius-slider.component';
import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CATALOG_PLACES } from '../shared/catalog';
import { REPAIR_REQUEST_LIMITS } from '../shared/repair-request';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { IconComponent } from './ui/icon.component';
import { BenefitCardComponent } from './ui/benefit-card.component';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {}

@Component({
  imports: [
    FormsModule,
    RadiusSliderComponent,
    RouterLink,
    SiteHeaderComponent,
    ButtonDirective,
    IconComponent,
    BenefitCardComponent,
  ],
  templateUrl: './app.html',
  host: { '(window:scroll)': 'updateNavbar()', '(window:resize)': 'updateNavbar()' },
})
export class FoundationComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly places = CATALOG_PLACES;
  protected placeId = 'xk-pristina';
  protected radiusKm = 20;
  protected searchError = '';
  protected readonly navbarDocked = signal(false);
  protected readonly scrollOffset = signal(0);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    this.language.setPage('landing.pageTitle', 'landing.intro');
    this.updateNavbar();
  }

  protected updateNavbar(): void {
    if (!this.browser) return;
    const inset = window.innerWidth >= 1024 ? 54 : window.innerWidth >= 640 ? 32 : 20;
    const scroll = Math.max(0, window.scrollY);
    this.scrollOffset.set(Math.min(scroll, inset));
    this.navbarDocked.set(scroll >= inset);
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

  protected toggleAnalyticsConsent(): void {
    this.analytics.setConsent(!this.analytics.consented);
  }
}
