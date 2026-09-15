import type { PersonalDataExport, Principal } from './access';
import type { AccountProfile } from '../shared/account';
import type {
  AppealInput,
  ContentReportInput,
  DataDeletionCompletion,
  DataDeletionRequest,
  ModerationActionInput,
  ModerationCaseDetail,
  ModerationCaseSummary,
  RetentionPolicy,
  RetentionPolicyInput,
  StaffQueueFilter,
  StaffQueuePage,
  StaffCaseDetail,
  StaffModerator,
  StaffCaseAssignment,
  StaffCaseEscalation,
} from '../shared/moderation';
export * from '../shared/moderation';

export interface ModerationLifecycleStore {
  validateStaffPrincipal?(principal: Principal): Promise<void> | void;
  recordVerifiedIdentity?(
    userId: string,
    roles: readonly ('admin' | 'moderator')[],
    profile: AccountProfile,
  ): Promise<void> | void;
  listStaffCases?(
    principal: Principal,
    filter: StaffQueueFilter,
  ): Promise<StaffQueuePage> | StaffQueuePage;
  getStaffCase?(principal: Principal, caseId: string): Promise<StaffCaseDetail> | StaffCaseDetail;
  listStaffModerators?(
    principal: Principal,
  ): Promise<readonly StaffModerator[]> | readonly StaffModerator[];
  assignStaffCase?(
    principal: Principal,
    caseId: string,
    input: StaffCaseAssignment,
  ): Promise<void> | void;
  escalateStaffCase?(
    principal: Principal,
    caseId: string,
    input: StaffCaseEscalation,
  ): Promise<void> | void;

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
