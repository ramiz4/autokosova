import { LucideChevronDown, LucideSearch, LucideX, type LucideIcon } from '@lucide/angular';
import { isPlatformBrowser } from '@angular/common';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { BrnOverlay, BrnOverlayContent } from '@spartan-ng/brain/overlay';
import { foldSelection } from '../../shared/garage-onboarding';
import { onboardingCopy } from '../../shared/onboarding-copy';
import { LanguageService } from '../language.service';
import { LucideIconComponent } from './lucide-icon.component';

export interface SelectionOption {
  readonly id: string;
  readonly label: string;
  readonly aliases?: readonly string[];
}

@Component({
  selector: 'app-multi-select',
  imports: [BrnOverlay, BrnOverlayContent, LucideIconComponent],
  host: { class: 'block min-w-0' },
  template: `
    <brn-overlay
      #choices="brnOverlay"
      [attachPositions]="positions"
      [autoFocus]="true"
      [closeOnOutsidePointerEvents]="true"
      [hasBackdrop]="false"
      [role]="null"
      scrollStrategy="reposition"
      [state]="opened() ? 'open' : 'closed'"
      (stateChanged)="onPopupState($event)"
    >
      <span [id]="controlId() + '-label'" class="mb-2 block text-sm font-semibold text-ink"
        >{{ label() }}
        @if (required()) {
          <span class="text-rose-600">*</span>
        }
      </span>
      <div
        #fieldAnchor
        class="flex min-h-12 min-w-0 items-center gap-1 rounded-lg border bg-white px-2 shadow-xs focus-within:ring-2 focus-within:ring-brand/25"
        [class.border-rose-500]="invalid()"
        [class.border-slate-200]="!invalid()"
      >
        @let selectedValues = values();
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          @for (value of selectedValues; track value) {
            <span
              class="inline-flex min-w-0 max-w-full items-center rounded-lg bg-blue-50 pl-2 text-xs text-[#284878]"
            >
              <span class="break-words">{{ optionLabel(value) }}</span>
              <button
                type="button"
                class="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-brand"
                [disabled]="disabled()"
                [attr.aria-label]="copy.remove + ': ' + optionLabel(value)"
                (click)="remove(value)"
              >
                <lucide-icon [name]="XIcon" class="size-3" />
              </button>
            </span>
          }
          @if (!selectedValues.length) {
            <span class="px-1 text-sm text-slate-500">{{ copy.choose }}</span>
          }
        </div>
        <button
          [id]="controlId()"
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-lg text-brand hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand"
          [disabled]="disabled()"
          [attr.aria-labelledby]="controlId() + '-label'"
          [attr.aria-expanded]="opened()"
          [attr.aria-controls]="controlId() + '-panel'"
          [attr.aria-invalid]="invalid()"
          (click)="toggle()"
        >
          <lucide-icon [name]="ChevronDownIcon" class="size-4" />
        </button>
      </div>
      <ng-template brnOverlayContent>
        <section
          [id]="controlId() + '-panel'"
          [style.width.px]="fieldWidth()"
          [attr.aria-labelledby]="controlId() + '-label'"
          class="rounded-xl border border-blue-200 bg-white p-2 text-ink shadow-xl shadow-blue-950/15"
        >
          <label class="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3"
            ><lucide-icon [name]="SearchIcon" class="size-4 text-slate-500" /><input
              #search
              type="search"
              (keydown.enter)="$event.preventDefault()"
              class="min-w-0 flex-1 py-2 text-sm outline-none"
              [attr.aria-label]="copy.search + ': ' + label()"
              [placeholder]="copy.search"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
          /></label>
          <div class="mt-2 max-h-56 overflow-y-auto" role="group" [attr.aria-label]="label()">
            @if (loading()) {
              <p class="p-3 text-sm" role="status">{{ copy.loading }}</p>
            } @else if (error()) {
              <p class="p-3 text-sm text-rose-700" role="alert">{{ copy.catalogError }}</p>
            } @else {
              @for (option of filtered(); track option.id) {
                <label
                  class="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-blue-50"
                  ><input
                    #optionInput
                    type="checkbox"
                    class="size-4 accent-brand"
                    [disabled]="disabled()"
                    [checked]="values().includes(option.id)"
                    (change)="select(option.id, optionInput.checked)"
                  /><span>{{ option.label }}</span></label
                >
              } @empty {
                <p class="p-3 text-sm text-slate-500" role="status">
                  {{ options().length ? copy.noMatches : copy.noOptions }}
                </p>
              }
            }
          </div>
          <div class="mt-2 flex justify-between border-t border-slate-100 text-xs">
            <button
              type="button"
              class="min-h-11 rounded-lg px-2 text-brand focus-visible:outline-2"
              [disabled]="disabled()"
              (click)="clearValues()"
            >
              {{ copy.clear }}</button
            ><button
              type="button"
              class="min-h-11 rounded-lg px-2 text-slate-700 focus-visible:outline-2"
              (click)="choices.close()"
            >
              {{ copy.close }}
            </button>
          </div>
        </section>
      </ng-template>
    </brn-overlay>
  `,
})
export class MultiSelectComponent {
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;
  readonly SearchIcon: LucideIcon = LucideSearch;
  readonly XIcon: LucideIcon = LucideX;

  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly options = input<readonly SelectionOption[]>([]);
  readonly values = model<readonly string[]>([]);
  readonly disabled = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly loading = input(false);
  readonly error = input(false);
  protected readonly opened = signal(false);
  protected readonly query = signal('');
  protected readonly fieldWidth = signal(0);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  ];
  private readonly language = inject(LanguageService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly fieldAnchor = viewChild.required<ElementRef<HTMLElement>>('fieldAnchor');
  private readonly choices = viewChild.required<BrnOverlay>('choices');
  protected get copy() {
    return onboardingCopy[this.language.language];
  }
  protected readonly filtered = computed(() => {
    const query = foldSelection(this.query());
    return this.options().filter((option) =>
      [option.label, option.id, ...(option.aliases ?? [])].some((term) =>
        foldSelection(term).includes(query),
      ),
    );
  });
  constructor() {
    effect(() => {
      if (this.disabled() && this.opened()) this.choices().close();
    });
    afterNextRender(() => {
      if (!this.browser || typeof ResizeObserver === 'undefined') return;
      const anchor = this.fieldAnchor().nativeElement;
      const measure = () => {
        this.fieldWidth.set(anchor.getBoundingClientRect().width);
        this.choices().updatePosition();
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(anchor);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
  protected optionLabel(id: string): string {
    return this.options().find((option) => option.id === id)?.label ?? id;
  }
  protected toggle(): void {
    if (this.disabled()) return;
    if (this.opened()) {
      this.choices().close();
    } else {
      this.query.set('');
      this.choices().setOrigin(this.fieldAnchor().nativeElement);
      this.choices().open();
    }
  }
  protected onPopupState(state: 'open' | 'closed'): void {
    const next = state === 'open' && !this.disabled();
    if (next && !this.opened()) this.query.set('');
    this.opened.set(next);
  }
  protected clearValues(): void {
    if (!this.disabled()) this.values.set([]);
  }
  protected select(id: string, checked: boolean): void {
    if (this.disabled()) return;
    this.values.set(
      checked
        ? [...new Set([...this.values(), id])]
        : this.values().filter((value) => value !== id),
    );
  }
  protected remove(id: string): void {
    this.select(id, false);
  }
}
