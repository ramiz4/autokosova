import type { PersonalDataExport, Principal } from './access';

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

export interface ModerationLifecycleStore {
  close?(): Promise<void>;
  assignModerationCase(
    admin: Principal,
    caseId: string,
    moderatorUserId: string,
  ): Promise<void> | void;
  applyModerationAction(
    principal: Principal,
    caseId: string,
    input: ModerationActionInput,
  ): Promise<ModerationCaseSummary> | ModerationCaseSummary;
  configureRetentionPolicy(
    admin: Principal,
    input: RetentionPolicyInput,
  ): Promise<RetentionPolicy> | RetentionPolicy;
  createAppeal(principal: Principal, input: AppealInput): Promise<string> | string;
  createContentReport(
    principal: Principal,
    input: ContentReportInput,
  ): Promise<ModerationCaseSummary> | ModerationCaseSummary;
  exportPersonalData(principal: Principal): Promise<PersonalDataExport> | PersonalDataExport;
  getModerationCase(
    principal: Principal,
    caseId: string,
  ): Promise<ModerationCaseDetail> | ModerationCaseDetail;
  listDataDeletionRequests(
    admin: Principal,
  ): Promise<readonly DataDeletionRequest[]> | readonly DataDeletionRequest[];
  listModerationQueue(
    principal: Principal,
  ): Promise<readonly ModerationCaseSummary[]> | readonly ModerationCaseSummary[];
  listOwnModerationCases(
    principal: Principal,
  ): Promise<readonly ModerationCaseSummary[]> | readonly ModerationCaseSummary[];
  processPersonalDataDeletion(
    admin: Principal,
    requestId: string,
  ): Promise<DataDeletionCompletion | void> | DataDeletionCompletion | void;
  requestPersonalDataDeletion(
    principal: Principal,
  ): Promise<DataDeletionRequest> | DataDeletionRequest;
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
