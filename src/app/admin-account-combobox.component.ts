import {
  afterNextRender,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Injector,
  Input,
  Output,
} from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import type { AdminUser } from '../shared/administration';

/** A deliberately small picker: it only renders the already authorized account projection. */
@Component({
  selector: 'app-admin-account-combobox',
  imports: [NgFor, NgIf],
  template: `
    <div class="relative" (keydown)="key($event)">
      <input
        [id]="inputId"
        type="search"
        autocomplete="off"
        role="combobox"
        [attr.aria-label]="label"
        aria-autocomplete="list"
        [attr.aria-expanded]="open && items.length > 0"
        [attr.aria-controls]="open && items.length ? listId : null"
        [attr.aria-activedescendant]="activeId"
        [value]="query"
        [disabled]="disabled"
        (input)="input($any($event.target).value)"
        (focus)="open = true"
        (blur)="close()"
        class="min-h-11 w-full rounded-lg border border-slate-300 px-3"
      />
      <ul
        *ngIf="open && items.length"
        [id]="listId"
        role="listbox"
        class="mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg"
      >
        <li
          *ngFor="let account of items; let index = index"
          [id]="optionId(index)"
          role="option"
          [attr.aria-selected]="index === active"
          [class.bg-slate-100]="index === active"
          class="cursor-pointer rounded px-3 py-2 hover:bg-slate-100"
          (mousedown)="$event.preventDefault()"
          (click)="choose(account)"
        >
          <span class="block font-semibold">{{ account.label }}</span>
          <span class="block text-sm text-muted">{{ account.id }}</span>
        </li>
      </ul>
      <p *ngIf="open && !items.length" role="status" class="mt-2 text-sm text-muted">
        {{ emptyLabel }}
      </p>
    </div>
  `,
})
export class AdminAccountComboboxComponent {
  @Input({ required: true }) inputId = '';
  @Input() disabled = false;
  @Input() emptyLabel = '';
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private accounts: readonly AdminUser[] = [];
  @Input({ required: true }) label = '';
  @Input() set items(value: readonly AdminUser[]) {
    this.accounts = value;
    this.active = -1;
  }
  get items(): readonly AdminUser[] {
    return this.accounts;
  }
  @Input() query = '';
  @Output() readonly queryChange = new EventEmitter<string>();
  @Output() readonly selected = new EventEmitter<AdminUser>();
  open = false;
  active = -1;
  get listId() {
    return this.inputId + '-listbox';
  }
  get activeId() {
    return this.open && this.items[this.active] ? this.optionId(this.active) : null;
  }
  optionId(index: number) {
    return this.inputId + '-option-' + index;
  }
  input(value: string) {
    if (this.disabled) return;
    this.open = true;
    this.active = -1;
    this.queryChange.emit(value);
  }
  close(): void {
    this.open = false;
    this.active = -1;
  }
  key(event: KeyboardEvent) {
    if (this.disabled) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') this.close();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open = true;
      if (!this.items.length) return;
      this.active =
        event.key === 'ArrowDown'
          ? Math.min(this.items.length - 1, this.active + 1)
          : this.active < 0
            ? this.items.length - 1
            : Math.max(0, this.active - 1);
      afterNextRender(
        () => {
          this.host.nativeElement
            .querySelector<HTMLElement>('[aria-selected="true"]')
            ?.scrollIntoView?.({ block: 'nearest' });
        },
        { injector: this.injector },
      );
      return;
    }
    if (event.key === 'Enter' && this.open && this.active >= 0) {
      event.preventDefault();
      this.choose(this.items[this.active]);
    }
  }
  choose(account: AdminUser | undefined) {
    if (this.disabled || !account || account.status !== 'active') return;
    this.close();
    this.selected.emit(account);
  }
}
