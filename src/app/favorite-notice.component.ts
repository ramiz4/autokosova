import { Component, inject, input } from '@angular/core';
import { FavoritesService } from './favorites.service';
import { LanguageService } from './language.service';
import { IconComponent } from './ui/icon.component';

@Component({
  selector: 'app-favorite-notice',
  imports: [IconComponent],
  template: `
    @if (favorites.message(); as message) {
      <div
        class="pointer-events-none fixed right-0 bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 z-[70] mx-auto flex w-[calc(100%_-_2rem)] max-w-xl justify-center"
      >
        <div
          [attr.role]="message === 'error' ? 'alert' : 'status'"
          class="pointer-events-auto flex w-full items-start gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-sm text-ink shadow-[0_8px_32px_-8px_rgba(7,20,62,0.22)]"
        >
          <span
            class="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full"
            [class]="message === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-brand'"
          >
            <app-icon
              [name]="
                message === 'error'
                  ? 'info'
                  : message === 'saved'
                    ? 'heart-filled'
                    : message === 'removed'
                      ? 'check'
                      : 'user'
              "
              class="size-[18px]"
            />
          </span>
          <div
            class="flex min-h-11 min-w-0 grow flex-wrap items-center gap-x-2 text-sm leading-5 font-medium"
          >
            <span>{{ language.t('favorites.' + message) }}</span>
            @if (message === 'signIn') {
              <a
                [href]="loginUrl()"
                class="inline-flex min-h-11 items-center rounded-sm font-semibold text-brand-dark underline decoration-brand/35 underline-offset-4 hover:decoration-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >{{ language.t('favorites.login') }}</a
              >
            }
          </div>
          <button
            type="button"
            class="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-slate-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            [attr.aria-label]="language.t('favorites.dismiss')"
            (click)="favorites.dismiss()"
          >
            <app-icon name="close" class="size-[18px]" />
          </button>
        </div>
      </div>
    }
  `,
})
export class FavoriteNoticeComponent {
  readonly loginUrl = input.required<string>();
  protected readonly favorites = inject(FavoritesService);
  protected readonly language = inject(LanguageService);
}
