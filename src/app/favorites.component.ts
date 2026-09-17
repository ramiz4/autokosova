import { LucideHeart, LucideSearch, type LucideIcon } from '@lucide/angular';
import { Component, afterNextRender, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { favoritesCopy, type FavoritesCopyKey } from '../shared/favorites-copy';
import { AccountSessionService } from './account-session.service';
import { FavoritesService } from './favorites.service';
import { FavoriteProfilesService } from './favorite-profiles.service';
import { FavoriteGarageCardComponent } from './favorite-garage-card.component';
import { FavoriteNoticeComponent } from './favorite-notice.component';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';

@Component({
  selector: 'app-favorites',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    ButtonDirective,
    LucideIconComponent,
    FavoriteGarageCardComponent,
    FavoriteNoticeComponent,
  ],
  providers: [FavoriteProfilesService],
  templateUrl: './favorites.component.html',
})
export class FavoritesComponent {
  readonly HeartIcon: LucideIcon = LucideHeart;
  readonly SearchIcon: LucideIcon = LucideSearch;

  protected readonly account = inject(AccountSessionService);
  protected readonly favorites = inject(FavoritesService);
  protected readonly profiles = inject(FavoriteProfilesService);
  protected readonly language = inject(LanguageService);
  protected readonly expired = signal(false);
  private hadSession = false;
  constructor() {
    effect(() => this.language.setPageText(this.text('title'), this.text('description'), true));
    effect(() => {
      if (this.account.state() === 'ready') {
        this.hadSession = true;
        this.expired.set(false);
      } else if (this.account.state() === 'guest' && this.hadSession) this.expired.set(true);
    });
    afterNextRender(() => {
      void this.favorites.load();
    });
  }
  protected text(
    key: FavoritesCopyKey,
    replacements: Record<string, string | number> = {},
  ): string {
    let text: string = favoritesCopy[this.language.language][key];
    for (const [name, value] of Object.entries(replacements))
      text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }
  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('favorites'))}`;
  }
}
