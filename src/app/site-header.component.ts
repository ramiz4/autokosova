import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';
import { ButtonDirective } from './ui/button.directive';
import { IconComponent } from './ui/icon.component';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, LanguageSwitcherComponent, ButtonDirective, IconComponent],
  templateUrl: './site-header.component.html',
})
export class SiteHeaderComponent {
  readonly compact = input(false);
  readonly active = input<'search' | undefined>();
  protected readonly language = inject(LanguageService);
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  protected readonly menuOpen = signal(false);

  protected closeMenu(restoreFocus = false): void {
    this.menuOpen.set(false);
    if (restoreFocus) this.menuButton()?.nativeElement.focus();
  }

  protected loginUrl(register = false): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('request'))}${register ? '&prompt=create' : ''}`;
  }
}
