import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { footerCopy, type FooterCopyKey } from '../shared/footer-copy';
import { AnalyticsService } from './analytics.service';
import { LanguageService, type AppRoute } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';

interface FooterLink {
  readonly route: AppRoute;
  readonly label: FooterCopyKey;
}

interface OfficialSocialLink {
  readonly label: string;
  readonly url: string;
}

// Add a URL only after the owner has confirmed it as an official public profile.
// No sample URLs, inferred handles, tracking parameters or private contact data.
export const OFFICIAL_SOCIAL_LINKS: readonly OfficialSocialLink[] = [];

@Component({
  selector: 'app-site-footer',
  host: { class: 'block' },
  imports: [RouterLink, LanguageSwitcherComponent],
  templateUrl: './site-footer.component.html',
})
export class SiteFooterComponent {
  protected readonly language = inject(LanguageService);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly year = new Date().getFullYear();
  protected readonly socialLinks = OFFICIAL_SOCIAL_LINKS;
  protected readonly columns: readonly {
    readonly title: FooterCopyKey;
    readonly links: readonly FooterLink[];
  }[] = [
    {
      title: 'customers',
      links: [
        { route: 'search', label: 'find' },
        { route: 'request', label: 'inquiry' },
        { route: 'help', label: 'helpTitle' },
      ],
    },
    {
      title: 'garages',
      links: [
        { route: 'onboarding', label: 'register' },
        { route: 'partners', label: 'partnersTitle' },
        { route: 'benefits', label: 'benefitsTitle' },
      ],
    },
    {
      title: 'about',
      links: [
        { route: 'mission', label: 'missionTitle' },
        { route: 'careers', label: 'careersTitle' },
        { route: 'blog', label: 'blogTitle' },
      ],
    },
  ];
  protected readonly legalLinks: readonly FooterLink[] = [
    { route: 'privacy', label: 'privacyTitle' },
    { route: 'terms', label: 'termsTitle' },
    { route: 'imprint', label: 'imprintTitle' },
  ];

  protected text(key: FooterCopyKey): string {
    return footerCopy[this.language.language][key];
  }

  protected toggleAnalyticsConsent(): void {
    this.analytics.setConsent(!this.analytics.consented);
  }
}
