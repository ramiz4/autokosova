import { Component, afterNextRender, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';

@Component({
  selector: 'app-account-profile',
  imports: [RouterLink, SiteHeaderComponent, LanguageSwitcherComponent, ButtonDirective],
  templateUrl: './account-profile.component.html',
})
export class AccountProfileComponent {
  protected readonly account = inject(AccountSessionService);
  protected readonly language = inject(LanguageService);
  protected readonly logoutError = signal(false);
  private readonly router = inject(Router);

  constructor() {
    effect(() => this.language.setPage('account.profileTitle', 'account.description', true));
    afterNextRender(() => {
      void this.account.refresh();
    });
  }

  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('profile'))}`;
  }

  protected async logout(): Promise<void> {
    this.logoutError.set(false);
    if (await this.account.logout()) {
      void this.router.navigateByUrl(this.language.link('home'));
    } else this.logoutError.set(true);
  }
}
