import { accountType } from '../shared/account';
import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender } from '@angular/core';
import { AccountSessionService } from './account-session.service';
import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';
import { ButtonDirective } from './ui/button.directive';
import { IconComponent } from './ui/icon.component';

@Component({
  selector: 'app-site-header',
  host: { '(document:pointerdown)': 'dismissOutside($event)' },
  imports: [
    RouterLink,
    NgTemplateOutlet,
    LanguageSwitcherComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './site-header.component.html',
})
export class SiteHeaderComponent {
  readonly compact = input(false);
  // Keep the logo consistent across landing, inquiry, search and onboarding navigation.
  readonly smallLogo = input(true);
  readonly loginReturnTo = input<string>();
  readonly active = input<
    'garage' | 'search' | 'request' | 'inquiries' | 'favorites' | undefined
  >();
  protected readonly account = inject(AccountSessionService);
  protected readonly accountType = accountType;
  protected readonly accountPanel = signal<'account' | 'notifications' | null>(null);
  protected readonly logoutError = signal(false);
  private readonly router = inject(Router);
  private readonly accountButton = viewChild<ElementRef<HTMLButtonElement>>('accountButton');
  private readonly notificationButton =
    viewChild<ElementRef<HTMLButtonElement>>('notificationButton');
  protected readonly language = inject(LanguageService);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  protected readonly menuOpen = signal(false);

  constructor() {
    afterNextRender(() => {
      void this.account.refresh();
    });
  }
  protected togglePanel(panel: 'account' | 'notifications'): void {
    this.menuOpen.set(false);
    this.accountPanel.set(this.accountPanel() === panel ? null : panel);
    if (this.accountPanel() === 'account') void this.account.refresh();
  }
  protected toggleMenu(): void {
    this.accountPanel.set(null);
    this.menuOpen.set(!this.menuOpen());
  }
  protected async logout(): Promise<void> {
    this.logoutError.set(false);
    const result = await this.account.logout(this.language.language);
    if (result === true) {
      this.closeMenu();
      void this.router.navigateByUrl(this.language.link('home'));
    } else if (result !== 'redirect') this.logoutError.set(true);
  }

  protected closeMenu(restoreFocus = false): void {
    const panel = this.accountPanel();
    this.menuOpen.set(false);
    this.accountPanel.set(null);
    if (restoreFocus)
      (panel === 'account'
        ? this.accountButton()
        : panel === 'notifications'
          ? this.notificationButton()
          : this.menuButton()
      )?.nativeElement.focus();
  }

  protected dismissOutside(event: PointerEvent): void {
    if (
      (this.menuOpen() || this.accountPanel()) &&
      event.target instanceof Node &&
      !this.element.nativeElement.contains(event.target)
    ) {
      this.closeMenu();
    }
  }

  protected loginUrl(register = false): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.loginReturnTo() ?? this.language.link('request'))}${register ? '&prompt=create' : ''}`;
  }
}
