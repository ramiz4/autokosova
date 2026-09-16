import { LucideTrash2, type LucideIcon } from '@lucide/angular';
import { DOCUMENT } from '@angular/common';
import {
  Component,
  afterNextRender,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { VEHICLE_MAKE_LABELS } from '../shared/catalog';
import type { RepairRequestSummary } from '../shared/saved-repair-request';
import { inquiriesCopy, type InquiriesCopyKey } from '../shared/inquiries-copy';
import { LanguageService } from './language.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';

@Component({
  selector: 'app-inquiry-delete-dialog',
  imports: [ButtonDirective, LucideIconComponent],
  styleUrl: './inquiry-dialog.scss',
  template: ` <dialog
    #dialog
    aria-labelledby="inquiry-delete-title"
    aria-describedby="inquiry-delete-summary inquiry-delete-help inquiry-delete-alternative"
    (cancel)="cancel($event)"
    data-delete-dialog
  >
    <header class="dialog-header">
      <div>
        <p class="eyebrow">{{ language.serviceLabel(request().serviceCategoryId) }}</p>
        <h2 id="inquiry-delete-title">{{ text('deleteTitle') }}</h2>
      </div>
      <lucide-icon [name]="TrashIcon" class="size-6 text-rose-700" />
    </header>
    <div class="dialog-body">
      <div id="inquiry-delete-summary" class="mb-4" data-delete-summary>
        <p>{{ vehicleLabel() }}</p>
        @if (request().symptomPreview) {
          <p>{{ request().symptomPreview }}</p>
        }
        <p class="help">
          {{ text('savedOn') }} <time [attr.datetime]="request().createdAt">{{ createdAt() }}</time>
        </p>
      </div>
      <p id="inquiry-delete-help">{{ text('deleteBody') }}</p>
      <p id="inquiry-delete-alternative" class="help mt-4">{{ text('deactivateInstead') }}</p>
      <p class="help mt-4">{{ text('fileRetention') }}</p>
      @if (saved.writeErrorKey(); as errorKey) {
        <p role="alert" class="error">{{ text(errorKey) }}</p>
      }
    </div>
    <footer class="dialog-footer">
      <button
        type="button"
        appButton="outline"
        size="compact"
        autofocus
        [disabled]="saved.writeState() === 'saving'"
        (click)="cancel()"
        data-cancel-delete
      >
        {{ text('cancel') }}</button
      ><button
        type="button"
        appButton
        size="compact"
        class="danger"
        [disabled]="saved.writeState() === 'saving'"
        (click)="remove()"
        data-confirm-delete
      >
        {{ text(saved.writeState() === 'saving' ? 'deleting' : 'deleteConfirm') }}
      </button>
    </footer>
  </dialog>`,
})
export class InquiryDeleteDialogComponent {
  readonly TrashIcon: LucideIcon = LucideTrash2;

  readonly request = input.required<RepairRequestSummary>();
  readonly closed = output<void>();
  protected readonly saved = inject(SavedRepairRequestsService);
  protected readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  constructor() {
    let previousFocus: HTMLElement | null = null;
    afterNextRender(() => {
      previousFocus = this.document.activeElement as HTMLElement;
      this.saved.writeState.set('idle');
      this.dialog().nativeElement.showModal();
    });
    inject(DestroyRef).onDestroy(() => {
      if (previousFocus?.isConnected) previousFocus.focus();
      else this.document.querySelector<HTMLElement>('#inquiries-title')?.focus();
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
    if (this.saved.writeState() !== 'saving') this.closed.emit();
  }
  protected async remove(): Promise<void> {
    if (await this.saved.mutate(this.request(), { kind: 'delete' })) this.closed.emit();
  }
}
