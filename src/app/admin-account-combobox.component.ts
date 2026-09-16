import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import type { AdminUser } from '../shared/administration';

/** A deliberately small picker: it only renders the already authorized account projection. */
@Component({
  selector: 'app-admin-account-combobox',
  imports: [NgFor, NgIf],
  template: `
    <div class="relative" (keydown)="key($event)">
      <input
        [id]="id"
        type="search"
        autocomplete="off"
        role="combobox"
        [attr.aria-label]="label"
        aria-autocomplete="list"
        [attr.aria-expanded]="open"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeId"
        [value]="query"
        (input)="input($any($event.target).value)"
        (focus)="open = true"
        class="min-h-11 w-full rounded-lg border border-slate-300 px-3"
      />
      <ul
        *ngIf="open && items.length"
        [id]="listId"
        role="listbox"
        class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg"
      >
        <li
          *ngFor="let account of items; let index = index"
          [id]="optionId(index)"
          role="option"
          [attr.aria-selected]="index === active"
          class="cursor-pointer rounded px-3 py-2 hover:bg-slate-100"
          (mousedown)="$event.preventDefault()"
          (click)="choose(account)"
        >
          <span class="block font-semibold">{{ account.label }}</span>
          <span class="block text-sm text-muted">{{ account.id }}</span>
        </li>
      </ul>
    </div>
  `,
})
export class AdminAccountComboboxComponent {
  @Input({ required: true }) id = '';
  @Input({ required: true }) label = '';
  @Input() items: readonly AdminUser[] = [];
  @Input() query = '';
  @Output() readonly queryChange = new EventEmitter<string>();
  @Output() readonly selected = new EventEmitter<AdminUser>();
  open = false;
  active = -1;
  get listId() {
    return this.id + '-listbox';
  }
  get activeId() {
    return this.active >= 0 ? this.optionId(this.active) : null;
  }
  optionId(index: number) {
    return this.id + '-option-' + index;
  }
  input(value: string) {
    this.open = true;
    this.active = -1;
    this.queryChange.emit(value);
  }
  key(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.open = false;
      this.active = -1;
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open = true;
      if (!this.items.length) return;
      this.active =
        event.key === 'ArrowDown'
          ? Math.min(this.items.length - 1, this.active + 1)
          : Math.max(0, this.active - 1);
      return;
    }
    if (event.key === 'Enter' && this.open && this.active >= 0) {
      event.preventDefault();
      this.choose(this.items[this.active]);
    }
  }
  choose(account: AdminUser) {
    this.open = false;
    this.active = -1;
    this.selected.emit(account);
  }
}
