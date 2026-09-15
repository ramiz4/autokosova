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
import type { RepairRequestSummary } from '../shared/saved-repair-request';
import { inquiriesCopy, type InquiriesCopyKey } from '../shared/inquiries-copy';
import { LanguageService } from './language.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';
import { ButtonDirective } from './ui/button.directive';
import { IconComponent } from './ui/icon.component';

@Component({
  selector: 'app-inquiry-delete-dialog',
  imports: [ButtonDirective, IconComponent],
  styleUrl: './inquiry-dialog.scss',
  template: ` <dialog
    #dialog
    aria-labelledby="inquiry-delete-title"
    aria-describedby="inquiry-delete-help"
    (cancel)="cancel($event)"
    data-delete-dialog
  >
    <header class="dialog-header">
      <div>
        <p class="eyebrow">{{ language.serviceLabel(request().serviceCategoryId) }}</p>
        <h2 id="inquiry-delete-title">{{ text('deleteTitle') }}</h2>
      </div>
      <app-icon name="trash" class="size-6 text-rose-700" />
    </header>
    <div class="dialog-body">
      <p id="inquiry-delete-help">{{ text('deleteBody') }}</p>
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
        {{ text(saved.writeState() === 'saving' ? 'saving' : 'delete') }}
      </button>
    </footer>
  </dialog>`,
})
export class InquiryDeleteDialogComponent {
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
