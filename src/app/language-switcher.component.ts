import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { LanguageService } from './language.service';

@Component({
  selector: 'app-language-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (compact()) {
      <details #languageDetails name="language-switcher" class="group relative">
        <summary
          class="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold leading-none text-ink focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
          [attr.aria-label]="language.t('a11y.language')"
          (click)="toggle($event, languageDetails)"
        >
          <span class="block leading-none">{{ language.language.toUpperCase() }}</span>
          <span
            aria-hidden="true"
            class="mb-1 size-2.5 rotate-45 border-r-2 border-b-2 border-current transition-transform group-open:mt-1 group-open:mb-0 group-open:rotate-225"
          ></span>
        </summary>
        <nav
          [class.bottom-full]="placement() === 'above'"
          [class.mb-2]="placement() === 'above'"
          [class.top-full]="placement() === 'below'"
          [class.mt-2]="placement() === 'below'"
          class="absolute right-0 z-50 min-w-32 rounded-xl border border-blue-100 bg-white p-2 shadow-xl"
          [attr.aria-label]="language.t('a11y.language')"
          (keydown.escape)="close($event, languageDetails)"
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
    } @else if (segmented()) {
      <nav
        class="grid grid-cols-3 gap-1 rounded-xl bg-slate-50 p-1 text-sm font-semibold"
        [attr.aria-label]="language.t('a11y.language')"
      >
        @for (item of language.languages; track item) {
          <a
            [attr.aria-current]="language.language === item ? 'page' : null"
            [href]="language.switchUrl(item)"
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 py-1 text-slate-600 no-underline hover:bg-white hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-brand aria-[current=page]:bg-white aria-[current=page]:text-brand aria-[current=page]:shadow-sm"
            >{{ item.toUpperCase() }}</a
          >
        }
      </nav>
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
  readonly segmented = input(false);
  readonly placement = input<'above' | 'below'>('below');
  protected readonly language = inject(LanguageService);
  private readonly details = viewChild<ElementRef<HTMLDetailsElement>>('languageDetails');

  @HostListener('document:pointerdown', ['$event'])
  protected closeOutside(event: PointerEvent): void {
    const details = this.details()?.nativeElement;
    if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
      details.open = false;
    }
  }

  protected close(event: Event, details: HTMLDetailsElement): void {
    event.preventDefault();
    event.stopPropagation();
    details.open = false;
    details.querySelector('summary')?.focus();
  }

  protected toggle(event: Event, details: HTMLDetailsElement): void {
    event.preventDefault();
    details.open = !details.open;
    if (details.open) queueMicrotask(() => details.querySelector<HTMLAnchorElement>('a')?.focus());
  }
}
