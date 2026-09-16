import type { StaffDecisionAction } from './staff-decision';

/**
 * The codes in this module deliberately carry no free text. They are safe for the append-only
 * audit trail; an explanatory message, when needed, lives only on the restricted case or appeal.
 */
export const MODERATION_REPORT_CATEGORIES = [
  'personal_data',
  'impersonation',
  'spam_or_deception',
  'unsafe_content',
  'other_policy_concern',
] as const;

export const MODERATION_REASON_CODES = [
  'no_violation',
  'missing_information',
  'policy_violation',
  'private_data_exposure',
  'unsafe_content',
  'abuse',
  'other_policy',
] as const;

export const MODERATION_ACTIONS = [
  'approve',
  'request_information',
  'reject',
  'temporarily_hide',
  'restore',
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
export type ModerationReasonCode = (typeof MODERATION_REASON_CODES)[number];
export type ModerationReportCategory = (typeof MODERATION_REPORT_CATEGORIES)[number];
export type ModerationSubjectType = 'review' | 'garage_profile';
export type ModerationCaseStatus =
  'submitted' | 'assigned' | 'waiting_for_subject' | 'resolved' | 'rejected';
export type ModerationPriority = 'normal' | 'high';

export interface ContentReportInput {
  readonly category: ModerationReportCategory;
  /** Optional, restricted context. It is never copied into an audit event or public response. */
  readonly details?: string;
  readonly subjectId: string;
  readonly subjectType: ModerationSubjectType;
}

export interface ModerationActionInput {
  readonly action: ModerationAction;
  readonly reasonCode: ModerationReasonCode;
  readonly caseRevision?: number;
}

export interface ModerationCaseSummary {
  readonly assignedModeratorUserId?: string;
  readonly id: string;
  readonly priority: ModerationPriority;
  readonly reasonCode?: ModerationReasonCode;
  readonly status: ModerationCaseStatus;
  readonly subjectId: string;
  readonly subjectType: ModerationSubjectType | 'data_deletion';
}

export interface ModerationCaseDetail extends ModerationCaseSummary {
  readonly createdAt: string;
  readonly report?: {
    readonly category: ModerationReportCategory;
    readonly details?: string;
    readonly reporterUserId: string;
  };
}

export interface AppealInput {
  readonly caseId: string;
  readonly message: string;
}

export interface RetentionPolicyInput {
  readonly auditLogRetentionDays: number;
  readonly operatorApprovalReference: string;
  readonly publicReviewHandling: 'delete' | 'retain_anonymized';
  readonly repairRequestRetentionDays: number;
  readonly reportRetentionDays: number;
  readonly reviewEvidenceRetentionDays: number;
  readonly version: string;
}

export interface RetentionPolicy extends RetentionPolicyInput {
  readonly configuredAt: string;
}

export interface DataDeletionRequest {
  readonly createdAt: string;
  readonly id: string;
  policyVersion?: string;
  readonly userId: string;
  status: 'submitted' | 'blocked_by_policy' | 'completed' | 'manual_content_decision_required';
}

export interface DataDeletionCompletion {
  readonly fileIds: readonly string[];
  readonly userId: string;
}

export type StaffCaseKind = 'report' | 'review_submission' | 'garage_submission' | 'data_deletion';
export const STAFF_ESCALATION_REASONS = [
  'requires_admin',
  'conflict_of_interest',
  'missing_information',
] as const;
export type StaffEscalationReason = (typeof STAFF_ESCALATION_REASONS)[number];
export interface StaffModerator {
  readonly userId: string;
  readonly label: string;
}
export interface StaffCaseSummary extends ModerationCaseSummary {
  readonly kind: StaffCaseKind;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly label: string;
  readonly assignedModeratorLabel?: string;
  readonly escalation?: { readonly reason: StaffEscalationReason; readonly createdAt: string };
}
export interface StaffCaseDetail extends StaffCaseSummary {
  readonly report?: { readonly category: ModerationReportCategory; readonly details?: string };
  readonly review?: {
    readonly text: string;
    readonly visitMonth: string;
    readonly serviceCategoryId: string;
    readonly garageId: string;
    readonly garageName: string;
    readonly publicationState: string;
    readonly evidenceStatus: string;
    readonly evidenceKind: string;
    readonly garageResponse?: { readonly text: string; readonly createdAt: string };
    readonly updates?: readonly {
      readonly text: string;
      readonly kind: string;
      readonly createdAt: string;
    }[];
    readonly ratings: {
      readonly workQuality: number;
      readonly communication: number;
      readonly priceTransparency: number;
      readonly punctuality: number;
    };
  };
  readonly garage?: {
    readonly name: string;
    readonly placeId: string;
    readonly description?: string;
    readonly photoUrls?: readonly string[];
    readonly publicationState: string;
  };
  readonly history: readonly {
    readonly action: string;
    readonly createdAt: string;
    readonly actorLabel?: string;
  }[];
  readonly appeals: readonly { readonly message: string; readonly createdAt: string }[];
  readonly canAssign: boolean;
  readonly canEscalate: boolean;
  readonly conflictOfInterest: boolean;
  /** Server affordances, not a replacement for transactional authorization. */
  readonly allowedActions?: readonly StaffDecisionAction[];
  readonly evidenceAvailable?: boolean;
  readonly openAppeal?: boolean;
}
export interface StaffQueueFilter {
  /** The task-first queue deliberately excludes completed cases unless explicitly requested. */
  readonly actionable?: boolean;
  readonly queue?: 'todo' | 'waiting' | 'done';
  readonly assignedUserId?: string;
  /** Administrative shortcut; never available to moderators. */
  readonly unassigned?: boolean;
  readonly page?: number;
  readonly kind?: StaffCaseKind;
  readonly status?: ModerationCaseStatus;
  readonly priority?: ModerationPriority;
  readonly escalated?: boolean;
}
export interface StaffQueuePage {
  readonly cases: readonly StaffCaseSummary[];
  readonly page: number;
  readonly hasMore: boolean;
}
export interface StaffCaseAssignment {
  readonly moderatorUserId: string;
  readonly revision: number;
}
export interface StaffCaseEscalation {
  readonly reason: StaffEscalationReason;
  readonly revision: number;
}

export function isModerationAction(value: unknown): value is ModerationAction {
  return typeof value === 'string' && MODERATION_ACTIONS.includes(value as ModerationAction);
}

export function isModerationReasonCode(value: unknown): value is ModerationReasonCode {
  return (
    typeof value === 'string' && MODERATION_REASON_CODES.includes(value as ModerationReasonCode)
  );
}

export function isModerationReportCategory(value: unknown): value is ModerationReportCategory {
  return (
    typeof value === 'string' &&
    MODERATION_REPORT_CATEGORIES.includes(value as ModerationReportCategory)
  );
}

export function isModerationSubjectType(value: unknown): value is ModerationSubjectType {
  return value === 'review' || value === 'garage_profile';
}

export function priorityForReport(category: ModerationReportCategory): ModerationPriority {
  return category === 'personal_data' || category === 'unsafe_content' ? 'high' : 'normal';
}
