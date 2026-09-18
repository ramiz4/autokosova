import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BrnAlertDialog,
  BrnAlertDialogContent,
  BrnAlertDialogDescription,
  BrnAlertDialogOverlay,
  BrnAlertDialogTitle,
} from '@spartan-ng/brain/alert-dialog';
import { ButtonDirective } from './button.directive';

export interface ConfirmationRequest {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly selectLabel?: string;
  readonly selectOptions?: readonly { value: string; label: string }[];
}

@Component({
  selector: 'app-confirmation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    BrnAlertDialog,
    BrnAlertDialogContent,
    BrnAlertDialogDescription,
    BrnAlertDialogOverlay,
    BrnAlertDialogTitle,
    ButtonDirective,
  ],
  template: `
    <brn-alert-dialog
      #dialog="brnAlertDialog"
      [state]="state()"
      [autoFocus]="'[data-confirmation-cancel]'"
      [closeOnOutsidePointerEvents]="true"
      (stateChanged)="state.set($event)"
      (closed)="closed($event)"
    >
      <brn-alert-dialog-overlay class="bg-black/80" />
      <ng-template brnAlertDialogContent>
        @let content = request();
        @if (content) {
          <section
            data-confirmation-dialog
            class="app-dialog-panel w-[min(760px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] rounded-[20px] border border-slate-200 bg-white text-ink shadow-2xl shadow-ink/20"
            (keydown.escape)="$event.preventDefault(); $event.stopPropagation(); choose(false)"
          >
            <header class="app-dialog-header px-6.5 pt-6.5">
              <h2 brnAlertDialogTitle class="text-2xl font-bold">{{ content.title }}</h2>
            </header>
            <div class="app-dialog-body px-6.5 pt-4">
              <p
                brnAlertDialogDescription
                class="whitespace-pre-line text-sm leading-[1.65] text-muted"
              >
                {{ content.description }}
              </p>
              @if (content.selectOptions && content.selectLabel) {
                <label class="mt-4 grid gap-2 text-sm font-semibold">
                  {{ content.selectLabel }}
                  <select
                    [(ngModel)]="selectedValue"
                    class="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value=""></option>
                    @for (opt of content.selectOptions; track opt.value) {
                      <option [value]="opt.value">{{ opt.label }}</option>
                    }
                  </select>
                </label>
              }
            </div>
            <footer
              class="app-dialog-footer flex flex-wrap justify-end gap-2.5 px-6.5 pt-4.5 pb-6.5"
            >
              <button
                type="button"
                appButton="outline"
                size="compact"
                data-confirmation-cancel
                (click)="choose(false)"
              >
                {{ content.cancelLabel }}
              </button>
              <button
                type="button"
                appButton
                size="compact"
                data-confirmation-confirm
                [disabled]="!!content.selectOptions && !selectedValue"
                (click)="choose(true)"
              >
                {{ content.confirmLabel }}
              </button>
            </footer>
          </section>
        }
      </ng-template>
    </brn-alert-dialog>
  `,
})
export class ConfirmationDialogComponent {
  readonly request = signal<ConfirmationRequest | null>(null);
  readonly state = signal<'closed' | 'open'>('closed');
  selectedValue = '';
  private readonly dialog = viewChild.required<BrnAlertDialog>('dialog');
  private resolve: ((answer: boolean) => void) | null = null;
  private closing = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelPending());
  }

  ask(request: ConfirmationRequest): Promise<boolean> {
    if (this.resolve || this.closing) return Promise.resolve(false);
    this.selectedValue = '';
    this.request.set(request);
    this.state.set('open');
    return new Promise<boolean>((resolve) => (this.resolve = resolve));
  }

  choose(answer: boolean): void {
    if (!this.resolve) return;
    this.dialog().close(answer);
  }

  cancelPending(): void {
    if (!this.resolve) return;
    this.closing = true;
    this.state.set('closed');
    this.finish(false);
  }

  protected closed(answer: unknown): void {
    this.state.set('closed');
    if (this.closing) {
      this.closing = false;
      return;
    }
    this.finish(answer === true);
  }

  private finish(answer: boolean): void {
    const resolve = this.resolve;
    if (!resolve) return;
    this.resolve = null;
    this.request.set(null);
    resolve(answer);
  }
}
