import {
  LucideArrowRight,
  LucideCheck,
  LucidePencil,
  LucideSearch,
  LucideShieldCheck,
  type LucideIcon,
} from '@lucide/angular';
import { ChangeDetectorRef, Component, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import {
  monetizationCopy,
  type MonetizationCardId,
  type MonetizationCopy,
} from '../shared/monetization-copy';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';

interface AudienceCard {
  readonly id: MonetizationCardId;
  readonly icon: LucideIcon;
  readonly route: 'onboarding' | 'search';
}

@Component({
  imports: [RouterLink, SiteHeaderComponent, ButtonDirective, LucideIconComponent],
  templateUrl: './monetization.component.html',
})
export class MonetizationComponent {
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly CheckIcon: LucideIcon = LucideCheck;
  readonly PencilIcon: LucideIcon = LucidePencil;
  readonly SearchIcon: LucideIcon = LucideSearch;
  readonly ShieldCheckIcon: LucideIcon = LucideShieldCheck;

  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
  protected readonly cards: readonly AudienceCard[] = [
    { id: 'drivers', icon: this.SearchIcon, route: 'search' },
    { id: 'profiles', icon: this.PencilIcon, route: 'onboarding' },
  ];

  protected get copy(): MonetizationCopy {
    return monetizationCopy[this.language.language];
  }

  protected focusContent(event: MouseEvent): void {
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (event.button === 0 && !modified) this.mainContent()?.nativeElement.focus();
  }

  constructor() {
    this.updateMetadata();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.updateMetadata();
        this.changeDetector.markForCheck();
      });
  }

  private updateMetadata(): void {
    this.language.setPageText(this.copy.title, this.copy.description);
  }
}
