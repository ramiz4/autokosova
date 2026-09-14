import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { foldSelection } from '../../shared/garage-onboarding';
import { onboardingCopy } from '../../shared/onboarding-copy';
import { LanguageService } from '../language.service';
import { IconComponent } from './icon.component';

export interface SelectionOption {
  readonly id: string;
  readonly label: string;
  readonly aliases?: readonly string[];
}

@Component({
  selector: 'app-multi-select',
  imports: [IconComponent],
  host: {
    class: 'relative block min-w-0',
    '(document:pointerdown)': 'outside($event)',
    '(keydown.escape)': 'close($event)',
  },
  template: `
    <span [id]="controlId() + '-label'" class="mb-2 block text-sm font-semibold text-ink"
      >{{ label() }}
      @if (required()) {
        <span class="text-rose-600">*</span>
      }
    </span>
    <div
      class="flex min-h-12 min-w-0 items-center gap-1 rounded-lg border bg-white px-2 shadow-xs focus-within:ring-2 focus-within:ring-brand/25"
      [class.border-rose-500]="invalid()"
      [class.border-slate-200]="!invalid()"
    >
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        @for (value of values(); track value) {
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
              <app-icon name="close" class="size-3" />
            </button>
          </span>
        }
        @if (!values().length) {
          <span class="px-1 text-sm text-slate-500">{{ copy.choose }}</span>
        }
      </div>
      <button
        #trigger
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
        <app-icon name="chevron-down" class="size-4" />
      </button>
    </div>
    @if (opened()) {
      <section
        [id]="controlId() + '-panel'"
        [attr.aria-labelledby]="controlId() + '-label'"
        class="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border border-blue-200 bg-white p-2 shadow-xl shadow-blue-950/15"
      >
        <label class="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3"
          ><app-icon name="search" class="size-4 text-slate-500" /><input
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
                  type="checkbox"
                  class="size-4 accent-brand"
                  [checked]="values().includes(option.id)"
                  (change)="select(option.id, $any($event.target).checked)"
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
            (click)="values.set([])"
          >
            {{ copy.clear }}</button
          ><button
            type="button"
            class="min-h-11 rounded-lg px-2 text-slate-700 focus-visible:outline-2"
            (click)="close()"
          >
            {{ copy.close }}
          </button>
        </div>
      </section>
    }
  `,
})
export class MultiSelectComponent {
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
  private readonly language = inject(LanguageService);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
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
  protected optionLabel(id: string): string {
    return this.options().find((option) => option.id === id)?.label ?? id;
  }
  protected toggle(): void {
    if (this.disabled()) return;
    this.opened.set(!this.opened());
    if (this.opened()) {
      this.query.set('');
      setTimeout(() => this.search()?.nativeElement.focus());
    }
  }
  protected close(event?: Event): void {
    event?.stopPropagation();
    this.opened.set(false);
    this.trigger()?.nativeElement.focus();
  }
  protected outside(event: PointerEvent): void {
    if (event.target instanceof Node && !this.element.nativeElement.contains(event.target))
      this.opened.set(false);
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
