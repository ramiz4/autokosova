import { Component, inject } from '@angular/core';
import { LanguageService } from './language.service';

@Component({
  selector: 'app-language-switcher',
  template: `
    <nav
      class="flex items-center gap-2 text-sm font-semibold"
      [attr.aria-label]="language.t('a11y.language')"
    >
      @for (item of language.languages; track item) {
        <a
          [attr.aria-current]="language.language === item ? 'page' : null"
          [href]="language.switchUrl(item)"
          class="rounded px-2 py-1 text-sky-800 underline underline-offset-2 aria-[current=page]:bg-sky-100 aria-[current=page]:no-underline"
          >{{ item.toUpperCase() }}</a
        >
      }
    </nav>
  `,
})
export class LanguageSwitcherComponent {
  protected readonly language = inject(LanguageService);
}
