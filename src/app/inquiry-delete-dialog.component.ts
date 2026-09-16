import { LucideTrash2, type LucideIcon } from '@lucide/angular';
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
      <brn-alert-dialog-overlay class="bg-[#07143e85]" />
      <ng-template brnAlertDialogContent>
        <section
          data-delete-dialog
          (keydown.escape)="cancel($event)"
          class="app-dialog-panel m-auto max-h-[calc(100dvh-24px)] w-[min(760px,calc(100vw-24px))] rounded-[20px] border border-[#dbe5f2] bg-white p-0 text-[#07143e] shadow-[0_24px_100px_#07143e35]"
        >
          <header
            class="app-dialog-header flex items-center justify-between gap-4 border-b border-[#e7edf5] bg-white px-[26px] py-[22px] max-[480px]:p-[18px]"
          >
            <div>
              <p class="mb-[6px] text-[11px] font-bold uppercase tracking-[.12em] text-[#536d98]">
                {{ language.serviceLabel(request().serviceCategoryId) }}
              </p>
              <h2
                brnAlertDialogTitle
                class="text-2xl font-bold tracking-[-.025em] max-[480px]:text-[21px]"
              >
                {{ text('deleteTitle') }}
              </h2>
            </div>
            <lucide-icon [name]="TrashIcon" class="size-6 text-[#bb2445]" />
          </header>
          <div class="app-dialog-body overflow-wrap-anywhere px-[26px] py-6 max-[480px]:p-[18px]">
            <div class="mb-4" data-delete-summary>
              <p>{{ vehicleLabel() }}</p>
              @if (request().symptomPreview) {
                <p>{{ request().symptomPreview }}</p>
              }
              <p class="text-sm leading-[1.65] text-[#536d98]">
                {{ text('savedOn') }}
                <time [attr.datetime]="request().createdAt">{{ createdAt() }}</time>
              </p>
            </div>
            <p brnAlertDialogDescription class="text-sm leading-[1.65] text-[#536d98]">
              {{ text('deleteBody') }}
            </p>
            <p class="mt-4 text-sm leading-[1.65] text-[#536d98]">
              {{ text('deactivateInstead') }}
            </p>
            <p class="mt-4 text-sm leading-[1.65] text-[#536d98]">{{ text('fileRetention') }}</p>
            @if (saved.writeErrorKey(); as errorKey) {
              <p
                role="alert"
                class="mt-[18px] rounded-xl border border-[#f1c9cf] bg-[#fff5f6] p-4 text-sm leading-[1.65] text-[#8e2037]"
              >
                {{ text(errorKey) }}
              </p>
            }
          </div>
          <footer
            class="app-dialog-footer dialog-footer flex flex-wrap justify-end gap-[10px] border-t border-[#e7edf5] bg-white px-[26px] py-[18px] max-[480px]:p-[18px]"
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
              class="border-[#bb2445] bg-[#bb2445] hover:bg-[#921a35] max-[480px]:flex-[1_1_160px]"
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
