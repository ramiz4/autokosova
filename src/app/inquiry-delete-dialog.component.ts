import { LucideTrash2, type LucideIcon } from '@autokosova/icons';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  BrnAlertDialog,
  BrnAlertDialogContent,
  BrnAlertDialogDescription,
  BrnAlertDialogOverlay,
  BrnAlertDialogTitle,
} from '@spartan-ng/brain/alert-dialog';
import { VEHICLE_MAKE_LABELS } from '../shared/catalog';
import type { RepairRequestSummary } from '../shared/saved-repair-request';
import { inquiriesCopy, type InquiriesCopyKey } from '../shared/inquiries-copy';
import { LanguageService } from './language.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';

@Component({
  selector: 'app-inquiry-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrnAlertDialog,
    BrnAlertDialogContent,
    BrnAlertDialogDescription,
    BrnAlertDialogOverlay,
    BrnAlertDialogTitle,
    ButtonDirective,
    LucideIconComponent,
  ],
  template: `
    <brn-alert-dialog
      [autoFocus]="'[data-cancel-delete]'"
      [closeOnOutsidePointerEvents]="false"
      [disableClose]="true"
      [restoreFocus]="'#actions-trigger-' + request().id"
      [state]="dialogState()"
      (closed)="onDialogClosed()"
    >
      <brn-alert-dialog-overlay class="bg-back/80" />
      <ng-template brnAlertDialogContent>
        <section
          data-delete-dialog
          (keydown.escape)="cancel($event)"
          class="app-dialog-panel m-auto max-h-[calc(100dvh-24px)] w-[min(760px,calc(100vw-24px))] rounded-[20px] border border-slate-200 bg-white p-0 text-ink shadow-2xl shadow-ink/20"
        >
          <header
            class="app-dialog-header flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6.5 py-5.5 max-[480px]:p-4.5"
          >
            <div>
              <p class="mb-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-muted">
                {{ language.serviceLabel(request().serviceCategoryId) }}
              </p>
              <h2
                brnAlertDialogTitle
                class="text-2xl font-bold tracking-tight max-[480px]:text-[21px]"
              >
                {{ text('deleteTitle') }}
              </h2>
            </div>
            <lucide-icon [name]="TrashIcon" class="size-6 text-rose-700" />
          </header>
          <div class="app-dialog-body overflow-wrap-anywhere px-6.5 py-6 max-[480px]:p-4.5">
            <div class="mb-4" data-delete-summary>
              <p>{{ vehicleLabel() }}</p>
              @if (request().symptomPreview) {
                <p>{{ request().symptomPreview }}</p>
              }
              <p class="text-sm leading-[1.65] text-muted">
                {{ text('savedOn') }}
                <time [attr.datetime]="request().createdAt">{{ createdAt() }}</time>
              </p>
            </div>
            <p brnAlertDialogDescription class="text-sm leading-[1.65] text-muted">
              {{ text('deleteBody') }}
            </p>
            <p class="mt-4 text-sm leading-[1.65] text-muted">
              {{ text('deactivateInstead') }}
            </p>
            <p class="mt-4 text-sm leading-[1.65] text-muted">{{ text('fileRetention') }}</p>
            @if (saved.writeErrorKey(); as errorKey) {
              <p
                role="alert"
                class="mt-4.5 rounded-xl border border-rose-200 bg-brand/5 p-4 text-sm leading-[1.65] text-rose-800"
              >
                {{ text(errorKey) }}
              </p>
            }
          </div>
          <footer
            class="app-dialog-footer dialog-footer flex flex-wrap justify-end gap-2.5 border-t border-slate-200 bg-white px-6.5 py-4.5 max-[480px]:p-4.5"
          >
            <button
              type="button"
              appButton="outline"
              size="compact"
              data-cancel-delete
              class="max-[480px]:flex-[1_1_160px]"
              [disabled]="saved.writeState() === 'saving'"
              (click)="cancel()"
            >
              {{ text('cancel') }}
            </button>
            <button
              type="button"
              appButton
              size="compact"
              data-confirm-delete
              class="border-rose-700 bg-rose-700 hover:bg-rose-800 max-[480px]:flex-[1_1_160px]"
              [disabled]="saved.writeState() === 'saving'"
              (click)="remove()"
            >
              {{ text(saved.writeState() === 'saving' ? 'deleting' : 'deleteConfirm') }}
            </button>
          </footer>
        </section>
      </ng-template>
    </brn-alert-dialog>
  `,
})
export class InquiryDeleteDialogComponent {
  readonly TrashIcon: LucideIcon = LucideTrash2;

  readonly request = input.required<RepairRequestSummary>();
  readonly closed = output<void>();
  protected readonly saved = inject(SavedRepairRequestsService);
  protected readonly language = inject(LanguageService);
  protected readonly dialogState = signal<'closed' | 'open'>('closed');

  constructor() {
    afterNextRender(() => {
      this.saved.writeState.set('idle');
      this.dialogState.set('open');
    });
  }
  protected vehicleLabel(): string {
    const vehicle = this.request().vehicle;
    return [
      vehicle?.makeId ? VEHICLE_MAKE_LABELS[vehicle.makeId] : '',
      vehicle?.model,
      vehicle?.year,
    ]
      .filter((value) => value !== undefined && value !== '')
      .join(' · ');
  }
  protected createdAt(): string {
    return new Intl.DateTimeFormat(this.language.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(this.request().createdAt));
  }
  protected text(key: InquiriesCopyKey): string {
    return inquiriesCopy[this.language.language][key];
  }
  protected cancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.saved.writeState() !== 'saving') this.dialogState.set('closed');
  }
  protected async remove(): Promise<void> {
    if (this.saved.writeState() === 'saving') return;
    if (await this.saved.mutate(this.request(), { kind: 'delete' })) this.dialogState.set('closed');
  }
  protected onDialogClosed(): void {
    this.closed.emit();
  }
}
