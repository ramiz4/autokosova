import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronDown, type LucideIcon } from '@lucide/angular';
import { BrnPopover, BrnPopoverContent } from '@spartan-ng/brain/popover';
import {
  BrnSelect,
  BrnSelectContent,
  BrnSelectItem,
  BrnSelectTrigger,
  BrnSelectValue,
} from '@spartan-ng/brain/select';
import { LucideIconComponent } from './lucide-icon.component';

export interface SelectFieldOption {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  imports: [
    BrnPopover,
    BrnPopoverContent,
    BrnSelect,
    BrnSelectContent,
    BrnSelectItem,
    BrnSelectTrigger,
    BrnSelectValue,
    LucideIconComponent,
  ],
  template: `
    <brn-popover
      brnSelect
      class="block"
      [value]="value()"
      [itemToString]="itemToString"
      (valueChange)="select($event)"
      align="start"
      [sideOffset]="8"
    >
      <button brnSelectTrigger type="button" class="select-trigger" [attr.aria-label]="label()">
        <span brnSelectValue class="select-value"></span>
        <lucide-icon [name]="ChevronDownIcon" class="select-chevron" />
      </button>
      <ng-template brnPopoverContent>
        <div brnSelectContent class="select-content">
          @for (option of options(); track option.value) {
            <div
              brnSelectItem
              [value]="option.value"
              [disabled]="option.disabled ?? false"
              class="select-option"
            >
              {{ option.label }}
            </div>
          }
        </div>
      </ng-template>
    </brn-popover>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .select-trigger {
      display: flex;
      width: 100%;
      min-height: 48px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid #dbe5f2;
      border-radius: 12px;
      background: #fff;
      padding: 0 16px;
      color: #07143e;
      box-shadow: 0 2px 7px rgb(18 52 86 / 3%);
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      font-weight: 650;
      text-align: left;
    }
    .select-trigger:hover {
      border-color: #cbd5e1;
    }
    .select-trigger:focus-visible {
      outline: 2px solid #0061ff;
      outline-offset: 2px;
    }
    .select-trigger:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .select-value {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .select-chevron {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      pointer-events: none;
    }
    .select-content {
      z-index: 50;
      width: var(--brn-select-width);
      max-height: 18rem;
      overflow-y: auto;
      border: 1px solid #dbe5f2;
      border-radius: 12px;
      background: #fff;
      padding: 6px;
      box-shadow: 0 12px 30px rgb(23 53 92 / 13%);
    }
    .select-option {
      display: flex;
      min-height: 44px;
      align-items: center;
      border-radius: 8px;
      padding: 0 12px;
      color: #07143e;
      cursor: pointer;
      font-size: 14px;
    }
    .select-option:hover,
    .select-option[aria-selected='true'] {
      background: rgb(0 97 255 / 8%);
    }
    .select-option[aria-selected='true'] {
      font-weight: 650;
    }
    .select-option[aria-disabled='true'] {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `,
})
export class SelectFieldComponent {
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;
  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectFieldOption[]>();
  readonly value = input.required<string>();
  readonly valueChange = output<string>();
  readonly itemToString = (value: string): string =>
    this.options().find((option) => option.value === value)?.label ?? value;

  protected select(value: string | null | undefined): void {
    if (typeof value === 'string') this.valueChange.emit(value);
  }
}
