import { ChangeDetectorRef, Component, inject } from '@angular/core';
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
import { IconComponent, type IconName } from './ui/icon.component';

interface MonetizationCard {
  readonly id: MonetizationCardId;
  readonly icon: IconName;
  readonly theme: string;
  readonly future: boolean;
  readonly route?: 'onboarding' | 'search';
}

@Component({
  imports: [RouterLink, SiteHeaderComponent, ButtonDirective, IconComponent],
  templateUrl: './monetization.component.html',
})
export class MonetizationComponent {
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly cards: readonly MonetizationCard[] = [
    {
      id: 'profiles',
      icon: 'pencil',
      theme: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      future: false,
      route: 'onboarding',
    },
    {
      id: 'tools',
      icon: 'clock',
      theme: 'border-blue-200 bg-blue-50 text-blue-900',
      future: true,
    },
    {
      id: 'drivers',
      icon: 'search',
      theme: 'border-orange-200 bg-orange-50 text-orange-900',
      future: false,
      route: 'search',
    },
    {
      id: 'partners',
      icon: 'user',
      theme: 'border-violet-200 bg-violet-50 text-violet-900',
      future: true,
    },
  ];

  protected get copy(): MonetizationCopy {
    return monetizationCopy[this.language.language];
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
        // The copy getter reads the router rather than a template signal.
        this.changeDetector.markForCheck();
      });
  }

  private updateMetadata(): void {
    this.language.setPageText(this.copy.title, this.copy.description);
  }
}
