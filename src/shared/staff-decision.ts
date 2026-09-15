import {
  MODERATION_ACTIONS,
  MODERATION_REASON_CODES,
  type ModerationAction,
  type ModerationCaseStatus,
  type ModerationReasonCode,
  type StaffCaseKind,
} from './moderation';
import {
  REVIEW_REJECTION_REASONS,
  type EvidenceVerificationChecklist,
  type ReviewRejectionReason,
} from './review-decision';

export type StaffDecisionAction = ModerationAction | 'publish_review' | 'reject_review';
export type StaffCaseDecision =
  | {
      readonly action: 'publish_review';
      readonly revision: number;
      readonly checklist: EvidenceVerificationChecklist;
    }
  | {
      readonly action: 'reject_review';
      readonly revision: number;
      readonly checklist: EvidenceVerificationChecklist;
      readonly rejectionReason: ReviewRejectionReason;
    }
  | {
      readonly action: ModerationAction;
      readonly revision: number;
      readonly reasonCode: ModerationReasonCode;
    };

export interface StaffDecisionContext {
  readonly kind: StaffCaseKind;
  readonly status: ModerationCaseStatus;
  readonly conflictOfInterest: boolean;
  readonly reviewState?: string;
  readonly subjectState?: string;
  readonly evidenceAvailable: boolean;
  readonly openAppeal: boolean;
  readonly restorable: boolean;
}

/** Affordances only: each write must repeat authorization and state checks in its transaction. */
export function staffDecisionActions(context: StaffDecisionContext): readonly StaffDecisionAction[] {
  if (context.conflictOfInterest) return [];
  const open = ['submitted', 'assigned', 'waiting_for_subject'].includes(context.status);
  if (context.kind === 'review_submission') {
    const reviewable =
      context.reviewState === 'under_review' ||
      (context.openAppeal && ['rejected', 'published'].includes(context.reviewState ?? ''));
    if (!open || !reviewable) return [];
    return [
      ...(context.evidenceAvailable ? (['publish_review'] as const) : []),
      'reject_review',
      'request_information',
    ];
  }
  if (context.kind !== 'report') return [];
  return [
    ...(open ? (['approve', 'request_information', 'reject'] as const) : []),
    ...(open && context.subjectState === 'published' ? (['temporarily_hide'] as const) : []),
    ...(context.restorable ? (['restore'] as const) : []),
  ];
}

/** Fixed codes and an explicit revision; private explanatory text is not an audit input. */
export function isStaffCaseDecision(value: unknown): value is StaffCaseDecision {
  if (!record(value)) return false;
  if (
    !Number.isSafeInteger(value['revision']) ||
    (value['revision'] as number) < 1 ||
    (value['revision'] as number) > 2147483647
  )
    return false;
  const action = value['action'];
  if (action === 'publish_review' || action === 'reject_review') {
    const checklist = value['checklist'];
    if (
      !record(checklist) ||
      !exactKeys(checklist, ['garageMatches', 'serviceMatches', 'visitMonthMatches']) ||
      Object.values(checklist).some((item) => typeof item !== 'boolean')
    )
      return false;
    return action === 'publish_review'
      ? exactKeys(value, ['action', 'revision', 'checklist'])
      : exactKeys(value, ['action', 'revision', 'checklist', 'rejectionReason']) &&
          REVIEW_REJECTION_REASONS.includes(value['rejectionReason'] as ReviewRejectionReason);
  }
  if (
    !MODERATION_ACTIONS.includes(action as ModerationAction) ||
    !MODERATION_REASON_CODES.includes(value['reasonCode'] as ModerationReasonCode) ||
    !exactKeys(value, ['action', 'revision', 'reasonCode'])
  )
    return false;
  if (action === 'approve' || action === 'restore') return value['reasonCode'] === 'no_violation';
  if (action === 'request_information') return value['reasonCode'] === 'missing_information';
  return value['reasonCode'] !== 'no_violation';
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
