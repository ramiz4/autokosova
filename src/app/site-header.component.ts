import {
  LucideChevronDown,
  LucideMenu,
  LucideUser,
  LucideX,
  type LucideIcon,
} from '@lucide/angular';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { NgTemplateOutlet } from '@angular/common';

import { AccountSessionService } from './account-session.service';

import { NavigationStart, Router, RouterLink } from '@angular/router';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { SiteHeaderAccountPanelComponent } from './site-header-account-panel.component';

@Component({
  selector: 'app-site-header',
  host: { '(document:pointerdown)': 'dismissNavigationOutside($event)' },
  imports: [
    RouterLink,
    NgTemplateOutlet,
    LanguageSwitcherComponent,
    ButtonDirective,
    LucideIconComponent,
    SiteHeaderAccountPanelComponent,
  ],
  templateUrl: './site-header.component.html',
})
export class SiteHeaderComponent {
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;
  readonly MenuIcon: LucideIcon = LucideMenu;
  readonly UserIcon: LucideIcon = LucideUser;
  readonly XIcon: LucideIcon = LucideX;

  readonly compact = input(false);
  // Keep the logo consistent across landing, inquiry, search and onboarding navigation.
  readonly smallLogo = input(true);
  readonly loginReturnTo = input<string>();
  readonly active = input<
    | 'admin'
    | 'moderation'
    | 'garage'
    | 'search'
    | 'request'
    | 'inquiries'
    | 'favorites'
    | 'reviews'
    | undefined
  >();
  /** Staff shells retain account/language controls but never expose customer navigation. */
  protected readonly internalShell = computed(
    () => this.active() === 'admin' || this.active() === 'moderation',
  );
  protected readonly account = inject(AccountSessionService);
  protected readonly panel = signal<'account' | 'navigation' | null>(null);
  protected readonly accountOpen = computed(() => this.panel() === 'account');
  protected readonly navigationOpen = computed(() => this.panel() === 'navigation');
  protected readonly headerWidth = signal(0);
  protected readonly headerPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ];
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly headerAnchor = viewChild.required<ElementRef<HTMLElement>>('headerAnchor');
  private readonly accountPanel = viewChild<SiteHeaderAccountPanelComponent>('accountPanel');
  protected readonly language = inject(LanguageService);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  protected readonly menuIcon = computed<LucideIcon>(() =>
    this.navigationOpen() ? this.XIcon : this.MenuIcon,
  );

  constructor() {
    afterNextRender(() => {
      void this.account.refresh();

      const header = this.headerAnchor().nativeElement;
      const measure = () => {
        this.headerWidth.set(header.getBoundingClientRect().width);
        this.accountPanel()?.updatePosition();
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(header);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    effect(() => {
      if (this.account.state() === 'guest' && this.accountOpen()) {
        this.accountPanel()?.closePanel();
        this.panel.set(null);
      }
    });
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.accountPanel()?.closePanel();
        this.panel.set(null);
      });
  }

  protected onAccountState(state: 'open' | 'closed'): void {
    if (state === 'open') {
      const newlyOpened = !this.accountOpen();
      this.panel.set('account');
      if (newlyOpened) void this.account.refresh();
    } else if (this.accountOpen()) {
      this.panel.set(null);
    }
  }

  protected toggleMenu(): void {
    this.accountPanel()?.closePanel();
    this.panel.set(this.navigationOpen() ? null : 'navigation');
  }

  protected closeNavigation(restoreFocus = false): void {
    const wasOpen = this.navigationOpen();
    this.panel.set(null);
    if (restoreFocus && wasOpen) this.menuButton()?.nativeElement.focus();
  }

  protected dismissNavigationOutside(event: PointerEvent): void {
    if (
      this.navigationOpen() &&
      event.target instanceof Node &&
      !this.element.nativeElement.contains(event.target)
    ) {
      this.closeNavigation();
    }
  }

  protected loginUrl(register = false): string {
    const returnTo = this.loginReturnTo();
    const destination = returnTo
      ? `returnTo=${encodeURIComponent(returnTo)}`
      : `locale=${this.language.language}`;
    return `/auth/login?${destination}${register ? '&prompt=create' : ''}`;
  }
}
