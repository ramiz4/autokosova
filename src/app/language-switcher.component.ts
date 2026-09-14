import { Component, inject, input } from '@angular/core';
import { LanguageService } from './language.service';
import { IconComponent } from './ui/icon.component';

@Component({
  selector: 'app-language-switcher',
  imports: [IconComponent],
  template: `
    @if (compact()) {
      <details
        #languages
        class="relative"
        (keydown.escape)="languages.open = false; languageToggle.focus(); $event.stopPropagation()"
      >
        <summary
          #languageToggle
          class="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold leading-none text-ink focus-visible:outline-2 focus-visible:outline-brand"
          [attr.aria-label]="language.t('a11y.language')"
        >
          <span class="block leading-none">{{ language.language.toUpperCase() }}</span>
          <app-icon name="chevron-down" class="size-4" />
        </summary>
        <nav
          class="absolute right-0 z-30 min-w-32 rounded-xl border border-blue-100 bg-white p-2 shadow-xl"
          [class.bottom-full]="placement() === 'above'"
          [class.mb-2]="placement() === 'above'"
          [class.mt-2]="placement() === 'below'"
          [attr.aria-label]="language.t('a11y.language')"
        >
          @for (item of language.languages; track item) {
            <a
              [attr.aria-current]="language.language === item ? 'page' : null"
              [href]="language.switchUrl(item)"
              class="flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand aria-[current=page]:bg-blue-50"
              >{{ language.languageLabels[item] }}</a
            >
          }
        </nav>
      </details>
    } @else {
      <nav
        class="flex items-center gap-2 text-sm font-semibold"
        [attr.aria-label]="language.t('a11y.language')"
      >
        @for (item of language.languages; track item) {
          <a
            [attr.aria-current]="language.language === item ? 'page' : null"
            [href]="language.switchUrl(item)"
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-2 py-1 text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand aria-[current=page]:bg-sky-100 aria-[current=page]:no-underline"
            >{{ item.toUpperCase() }}</a
          >
        }
      </nav>
    }
  `,
})
export class LanguageSwitcherComponent {
  readonly compact = input(false);
  readonly placement = input<'above' | 'below'>('below');
  protected readonly language = inject(LanguageService);
}
