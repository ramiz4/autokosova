import { LucideChevronDown, type LucideIcon } from '@lucide/angular';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { BrnOverlay, BrnOverlayContent, BrnOverlayTrigger } from '@spartan-ng/brain/overlay';
import { LanguageService } from './language.service';
import { LucideIconComponent } from './ui/lucide-icon.component';

@Component({
  selector: 'app-language-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrnOverlay, BrnOverlayContent, BrnOverlayTrigger, LucideIconComponent],
  template: `
    @if (compact()) {
      <brn-overlay
        [attachPositions]="positions()"
        [attachTo]="languageButton"
        [autoFocus]="true"
        [closeOnOutsidePointerEvents]="true"
        [hasBackdrop]="false"
        [role]="null"
        scrollStrategy="reposition"
        [state]="state()"
        (stateChanged)="state.set($event)"
      >
        <button
          #languageButton
          brnOverlayTrigger
          type="button"
          class="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold leading-none text-ink focus-visible:outline-2 focus-visible:outline-brand"
          [attr.aria-label]="language.t('a11y.language')"
        >
          <span class="block leading-none">{{ language.language.toUpperCase() }}</span>
          <lucide-icon [name]="ChevronDownIcon" class="size-4" />
        </button>
        <ng-template brnOverlayContent>
          <nav
            class="min-w-32 rounded-xl border border-blue-100 bg-white p-2 shadow-xl"
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
        </ng-template>
      </brn-overlay>
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
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;

  readonly compact = input(false);
  readonly segmented = input(false);
  readonly placement = input<'above' | 'below'>('below');
  protected readonly state = signal<'closed' | 'open'>('closed');
  protected readonly positions = computed<ConnectedPosition[]>(() => {
    const above: ConnectedPosition = {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8,
    };
    const below: ConnectedPosition = {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 8,
    };
    return this.placement() === 'above' ? [above, below] : [below, above];
  });
  protected readonly language = inject(LanguageService);
}
