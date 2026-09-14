import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  template: `
    <footer
      class="mx-auto flex max-w-[1352px] flex-wrap items-start justify-between gap-8 px-6 py-10"
    >
      <div>
        <a
          [routerLink]="language.link('home')"
          [attr.aria-label]="language.t('common.backHome')"
          class="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <img
            src="/branding/autokosova-logo-header.png"
            width="640"
            height="122"
            alt="AutoKosova"
            class="h-auto w-44"
            loading="lazy"
          />
        </a>
        <p class="mt-2 text-sm text-muted">{{ language.t('landing.footer') }}</p>
      </div>
      <details class="max-w-lg text-sm text-muted">
        <summary
          class="min-h-11 rounded-lg py-3 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          {{ language.t('analytics.title') }}
        </summary>
        <p class="mt-2 leading-relaxed">{{ language.t('analytics.description') }}</p>
        <button
          type="button"
          class="mt-3 min-h-11 rounded-lg font-bold text-brand-dark underline focus-visible:outline-2 focus-visible:outline-brand"
          [attr.aria-pressed]="analytics.consented"
          (click)="toggleAnalyticsConsent()"
        >
          {{ language.t(analytics.consented ? 'analytics.disable' : 'analytics.enable') }}
        </button>
      </details>
    </footer>
  `,
})
export class SiteFooterComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly language = inject(LanguageService);

  protected toggleAnalyticsConsent(): void {
    this.analytics.setConsent(!this.analytics.consented);
  }
}
