import {
  LucideChevronDown,
  LucideHeart,
  LucideMessageCircle,
  LucideSettings,
  LucideShieldCheck,
  LucideStar,
  LucideUser,
  LucideWrench,
  LucideX,
  type LucideIcon,
} from '@autokosova/icons';
import {
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { Router, RouterLink } from '@angular/router';
import { BrnOverlay, BrnOverlayContent, BrnOverlayTrigger } from '@spartan-ng/brain/overlay';

import { accountType } from '../shared/account';
import { accountNavigationCopy } from '../shared/account-navigation-copy';

import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { LucideIconComponent } from './ui/lucide-icon.component';

@Component({
  selector: 'app-site-header-account-panel',
  imports: [RouterLink, BrnOverlay, BrnOverlayContent, BrnOverlayTrigger, LucideIconComponent],
  templateUrl: './site-header-account-panel.component.html',
})
export class SiteHeaderAccountPanelComponent {
  readonly MessageCircleIcon: LucideIcon = LucideMessageCircle;
  readonly SettingsIcon: LucideIcon = LucideSettings;
  readonly ShieldCheckIcon: LucideIcon = LucideShieldCheck;
  readonly StarIcon: LucideIcon = LucideStar;
  readonly HeartIcon: LucideIcon = LucideHeart;
  readonly UserIcon: LucideIcon = LucideUser;
  readonly WrenchIcon: LucideIcon = LucideWrench;
  readonly XIcon: LucideIcon = LucideX;
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;

  readonly active = input<string>();
  readonly headerAnchor = input.required<HTMLElement>();
  readonly headerPositions = input.required<ConnectedPosition[]>();
  readonly headerWidth = input(0);
  readonly internalShell = input(false);
  readonly stateChanged = output<'open' | 'closed'>();
  readonly closeRequested = output<void>();

  protected readonly account = inject(AccountSessionService);
  protected readonly accountType = accountType;
  protected readonly accountNavigationCopy = accountNavigationCopy;
  protected readonly language = inject(LanguageService);
  protected readonly logoutError = signal(false);
  protected readonly overlayState = signal<'open' | 'closed'>('closed');
  private readonly router = inject(Router);
  private readonly overlay = viewChild.required<BrnOverlay>('accountOverlay');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('accountTrigger');

  constructor() {
    afterNextRender(() => {
      this.overlay().setOrigin(this.headerAnchor());
      this.trigger().nativeElement.focus({ preventScroll: true });
      this.overlayState.set('open');
    });
  }

  updatePosition(): void {
    this.overlay().updatePosition();
  }

  closePanel(): void {
    this.overlayState.set('closed');
  }

  protected openPanel(): void {
    this.overlayState.set('open');
  }

  protected onOverlayState(state: 'open' | 'closed'): void {
    if (state === 'closed' || this.overlayState() === 'open') this.overlayState.set(state);
    this.stateChanged.emit(state);
  }

  protected close(): void {
    this.closePanel();
    this.closeRequested.emit();
  }

  protected async logout(): Promise<void> {
    this.logoutError.set(false);
    const result = await this.account.logout(this.language.language);
    if (result === true) {
      this.close();
      void this.router.navigateByUrl(this.language.link('home'));
    } else if (result !== 'redirect') this.logoutError.set(true);
  }
}
