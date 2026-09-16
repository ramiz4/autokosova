import {
  LucideBuilding2,
  LucideCheck,
  LucideChevronRight,
  LucideCopy,
  LucideFileText,
  LucideHeart,
  LucideInfo,
  LucideLogOut,
  LucideMessageCircle,
  LucideSettings,
  LucideStar,
  LucideUser,
  LucideUsers,
  LucideWrench,
  type LucideIcon,
} from '@lucide/angular';
import { reviewLabel } from '../shared/review-copy';
import { accountProfileCopy } from '../shared/account-profile-copy';
import { accountType } from '../shared/account';
import { Component, afterNextRender, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';

type CopyField = 'username' | 'userId';
type CopyState = 'idle' | 'copied' | 'error';

@Component({
  selector: 'app-account-profile',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    LanguageSwitcherComponent,
    ButtonDirective,
    LucideIconComponent,
  ],
  templateUrl: './account-profile.component.html',
})
export class AccountProfileComponent {
  readonly BuildingIcon: LucideIcon = LucideBuilding2;
  readonly CheckIcon: LucideIcon = LucideCheck;
  readonly ChevronRightIcon: LucideIcon = LucideChevronRight;
  readonly CopyIcon: LucideIcon = LucideCopy;
  readonly FileTextIcon: LucideIcon = LucideFileText;
  readonly HeartIcon: LucideIcon = LucideHeart;
  readonly InfoIcon: LucideIcon = LucideInfo;
  readonly LogoutIcon: LucideIcon = LucideLogOut;
  readonly MessageCircleIcon: LucideIcon = LucideMessageCircle;
  readonly SettingsIcon: LucideIcon = LucideSettings;
  readonly StarIcon: LucideIcon = LucideStar;
  readonly UserIcon: LucideIcon = LucideUser;
  readonly UsersIcon: LucideIcon = LucideUsers;
  readonly WrenchIcon: LucideIcon = LucideWrench;

  protected readonly reviewLabel = reviewLabel;
  protected readonly account = inject(AccountSessionService);
  protected readonly accountType = accountType;
  protected readonly language = inject(LanguageService);
  protected readonly logoutError = signal(false);
  protected readonly copyState = signal<Record<CopyField, CopyState>>({
    username: 'idle',
    userId: 'idle',
  });
  private readonly router = inject(Router);

  constructor() {
    effect(() =>
      this.language.setPageText(
        this.t('account.profileTitle'),
        this.t('account.description'),
        true,
      ),
    );
    effect(() => {
      this.account.dataContext();
      this.copyState.set({ username: 'idle', userId: 'idle' });
    });
    afterNextRender(() => {
      void this.account.refresh();
    });
  }

  protected t(key: string): string {
    const profileText = (
      accountProfileCopy[this.language.language] as Readonly<Record<string, string>>
    )[key];
    return profileText ?? this.language.t(key);
  }

  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('profile'))}`;
  }

  protected async copyAccountValue(field: CopyField, value: string | undefined): Promise<void> {
    if (!value) return;
    this.setCopyState(field, 'idle');
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(value);
      this.setCopyState(field, 'copied');
    } catch {
      this.setCopyState(field, 'error');
    }
  }

  protected async logout(): Promise<void> {
    this.logoutError.set(false);
    const result = await this.account.logout(this.language.language);
    if (result === true) {
      void this.router.navigateByUrl(this.language.link('home'));
    } else if (result !== 'redirect') this.logoutError.set(true);
  }

  private setCopyState(field: CopyField, state: CopyState): void {
    this.copyState.update((current) => ({ ...current, [field]: state }));
  }
}
