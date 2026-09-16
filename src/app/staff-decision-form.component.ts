import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageService } from './language.service';
import { ButtonDirective } from './ui/button.directive';
import { staffLabel } from '../shared/staff-copy';
import type { StaffCaseDetail, ModerationReasonCode } from '../shared/moderation';
import { type StaffCaseDecision, type StaffDecisionAction } from '../shared/staff-decision';
import { REVIEW_REJECTION_REASONS, type ReviewRejectionReason } from '../shared/review-decision';
import { StaffDraftGuardService } from './staff-draft-guard.service';

@Component({
  selector: 'app-staff-decision-form',
  imports: [FormsModule, ButtonDirective],
  templateUrl: './staff-decision-form.component.html',
})
export class StaffDecisionFormComponent {
  readonly detail = input.required<StaffCaseDetail>();
  readonly busy = input(false);
  readonly stale = input(false);
  readonly completed = input(false);
  readonly submitted = output<StaffCaseDecision>();
  readonly dirtyChange = output<boolean>();
  readonly language = inject(LanguageService);
  private readonly draftGuard = inject(StaffDraftGuardService);
  readonly actions = computed(() => (this.completed() ? [] : (this.detail().allowedActions ?? [])));
  readonly rejectionReasons = REVIEW_REJECTION_REASONS;
  readonly violationReasons = [
    'policy_violation',
    'private_data_exposure',
    'unsafe_content',
    'abuse',
    'other_policy',
  ] as const;
  action: StaffDecisionAction | '' = '';
  rejectionReason: ReviewRejectionReason | '' = '';
  reason: ModerationReasonCode | '' = '';
  garageMatches = false;
  serviceMatches = false;
  visitMonthMatches = false;
  private initialKey = '';
  private discardVersion = 0;
  constructor() {
    effect(() => {
      const discardVersion = this.draftGuard.discardVersion();
      const detail = this.detail();
      const key = `${detail.id}:${detail.reviewMaterialVersion ?? detail.revision}`;
      if (this.initialKey !== key || this.completed() || this.discardVersion !== discardVersion) {
        this.initialKey = key;
        this.discardVersion = discardVersion;
        this.discard();
      }
    });
  }
  label(value: string): string {
    return staffLabel(value, this.language.language);
  }
  valid(): boolean {
    if (!this.action || !this.actions().includes(this.action) || this.busy() || this.stale())
      return false;
    if (this.action === 'publish_review')
      return (
        this.garageMatches &&
        this.serviceMatches &&
        this.visitMonthMatches &&
        this.detail().evidenceAvailable === true
      );
    if (this.action === 'reject_review') return this.rejectionReason !== '';
    if (this.action === 'reject' || this.action === 'temporarily_hide')
      return this.violationReasons.some((reason) => reason === this.reason);
    return true;
  }
  publishValid(): boolean {
    return (
      this.actions().includes('publish_review') &&
      this.garageMatches &&
      this.serviceMatches &&
      this.visitMonthMatches &&
      this.detail().evidenceAvailable === true &&
      !this.busy() &&
      !this.stale()
    );
  }
  choose(action: StaffDecisionAction): void {
    this.action = action;
    this.emitDirty();
    if (
      action === 'publish_review' ||
      action === 'request_information' ||
      action === 'approve' ||
      action === 'restore'
    )
      this.submit();
  }
  discard(): void {
    this.action = '';
    this.rejectionReason = '';
    this.reason = '';
    this.garageMatches = this.serviceMatches = this.visitMonthMatches = false;
    this.dirtyChange.emit(false);
  }
  emitDirty(): void {
    this.dirtyChange.emit(
      this.garageMatches ||
        this.serviceMatches ||
        this.visitMonthMatches ||
        this.rejectionReason !== '' ||
        this.reason !== '',
    );
  }
  submit(): void {
    if (!this.valid()) return;
    const action = this.action as StaffDecisionAction;
    const revision = this.detail().revision;
    const checklist = {
      garageMatches: this.garageMatches,
      serviceMatches: this.serviceMatches,
      visitMonthMatches: this.visitMonthMatches,
    };
    let decision: StaffCaseDecision;
    if (action === 'publish_review') decision = { action, revision, checklist };
    else if (action === 'reject_review')
      decision = {
        action,
        revision,
        checklist,
        rejectionReason: this.rejectionReason as ReviewRejectionReason,
      };
    else
      decision = {
        action,
        revision,
        reasonCode:
          action === 'request_information'
            ? 'missing_information'
            : action === 'approve' || action === 'restore'
              ? 'no_violation'
              : (this.reason as ModerationReasonCode),
      };
    if (
      ['publish_review', 'reject_review', 'reject', 'temporarily_hide', 'restore'].includes(
        action,
      ) &&
      !window.confirm(
        `${this.label(action)}?\n\n${this.detail().label}\n${this.label('effect_' + action)}`,
      )
    )
      return;
    this.submitted.emit(decision);
  }
}
