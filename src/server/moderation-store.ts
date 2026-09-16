import { assertCurrentStaffIdentity, assertStaffCandidate } from './staff-identity';
import { PostgresStaffWorkspace } from './staff-workspace-store';
import { PostgresReviewStore } from './review-store';
import { assertCaseRevision } from './staff-case-revision';
import { isStaffCaseDecision, type StaffCaseDecision } from '../shared/staff-decision';
import type { AccountProfile } from '../shared/account';
import type {
  StaffQueueFilter,
  StaffCaseAssignment,
  StaffCaseEscalation,
} from '../shared/moderation';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  AccessError,
  type PersonalDataExport,
  type Principal,
  type StoredRepairRequest,
} from './access';
import {
  isModerationAction,
  isModerationReasonCode,
  isModerationReportCategory,
  isModerationSubjectType,
  priorityForReport,
  type AppealInput,
  type ContentReportInput,
  type DataDeletionCompletion,
  type DataDeletionRequest,
  type ModerationActionInput,
  type ModerationCaseDetail,
  type ModerationCaseStatus,
  type ModerationCaseSummary,
  type ModerationLifecycleStore,
  type ModerationPriority,
  type ModerationReasonCode,
  type ModerationSubjectType,
  type RetentionPolicy,
  type RetentionPolicyInput,
} from './moderation';
import { calculateOverallRating, type OwnReview } from './reviews';

interface CaseRow {
  readonly revision: number;
  readonly kind: string;
  readonly escalation_reason: string | null;
  readonly decided_by_user_id: string | null;
  readonly appeal_against_user_id: string | null;
  readonly assigned_moderator_user_id: string | null;
  readonly created_at: Date;
  readonly id: string;
  readonly priority: ModerationPriority;
  readonly reason_code: ModerationReasonCode | null;
  readonly requester_user_id: string | null;
  readonly status: ModerationCaseStatus;
  readonly subject_id: string;
  readonly subject_type: ModerationSubjectType | 'data_deletion';
}

interface ReviewRow {
  readonly communication: number;
  readonly evidence_status: OwnReview['evidenceStatus'];
  readonly id: string;
  readonly price_transparency: number;
  readonly publication_state: OwnReview['publicationState'];
  readonly punctuality: number;
  readonly rejection_reason_code: OwnReview['rejectionReason'] | null;
  readonly service_category_id: string;
  readonly visit_month: string;
  readonly garage_id: string;
  readonly work_quality: number;
}

interface DataDeletionRequestRow {
  readonly created_at: Date;
  readonly id: string;
  readonly policy_version: string | null;
  readonly status: DataDeletionRequest['status'];
  readonly user_id: string;
}

interface RepairRequestRow {
  readonly active: boolean;
  readonly revision: number;
  readonly updated_at: Date;
  readonly created_at: Date;
  readonly earliest_dropoff_on: Date | string;
  readonly id: string;
  readonly latest_pickup_on: Date | string;
  readonly service_category_id: StoredRepairRequest['serviceCategoryId'];
  readonly symptom: string | null;
}

/**
 * PostgreSQL-backed case and lifecycle repository. The app keeps OIDC sessions in the identity
 * adapter; this repository owns durable moderation facts and never writes report text to audit.
 */
export class PostgresModerationStore implements ModerationLifecycleStore {
  private readonly pool: pg.Pool;
  private readonly workspace: PostgresStaffWorkspace;
  private readonly reviewDecisions: PostgresReviewStore;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
    this.workspace = new PostgresStaffWorkspace(this.pool);
    this.reviewDecisions = new PostgresReviewStore(this.pool);
  }

  validateStaffPrincipal(principal: Principal) {
    return this.workspace.validate(principal);
  }

  recordVerifiedIdentity(
    userId: string,
    roles: readonly ('admin' | 'moderator')[],
    profile: AccountProfile,
  ) {
    return this.workspace.recordVerifiedIdentity(userId, roles, profile);
  }
  listStaffCases(principal: Principal, filter: StaffQueueFilter) {
    return this.workspace.list(principal, filter);
  }
  getStaffCase(principal: Principal, caseId: string) {
    return this.workspace.get(principal, caseId);
  }
  listStaffModerators(principal: Principal) {
    return this.workspace.moderators(principal);
  }
  assignStaffCase(principal: Principal, caseId: string, input: StaffCaseAssignment) {
    return this.workspace.assign(principal, caseId, input);
  }
  escalateStaffCase(principal: Principal, caseId: string, input: StaffCaseEscalation) {
    return this.workspace.escalate(principal, caseId, input);
  }

  async decideStaffCase(
    principal: Principal,
    caseId: string,
    input: StaffCaseDecision,
  ): Promise<void> {
    if (!isStaffCaseDecision(input)) throw new AccessError(422, 'Case decision is invalid');
    const detail = await this.workspace.get(principal, caseId);
    if (detail.conflictOfInterest)
      throw new AccessError(403, 'A person involved in a case cannot decide it');
    if (!detail.allowedActions?.includes(input.action))
      throw new AccessError(409, 'This action is not available for the current case');
    // These are the existing domain writers, not another publication workflow. They repeat
    // access/state checks and compare the expected revision while holding the case row lock.
    if (input.action === 'publish_review' || input.action === 'reject_review') {
      if (detail.kind !== 'review_submission' || caseId !== `review:${detail.subjectId}`)
        throw new AccessError(409, 'Review decisions require their canonical submission case');
      await this.reviewDecisions.decideReview(principal, detail.subjectId, {
        caseRevision: input.revision,
        checklist: input.checklist,
        decision: input.action === 'publish_review' ? 'published' : 'rejected',
        ...(input.action === 'reject_review' ? { rejectionReason: input.rejectionReason } : {}),
      });
      return;
    }
    if (input.action === 'request_information' && detail.kind === 'review_submission') {
      await this.transaction(principal, async (client) => {
        const record = await this.requireCaseAccess(client, principal, caseId, true);
        assertCaseRevision(record.revision, input.revision);
        await this.requireNoConflict(client, record, principal.userId);
        if (
          record.kind !== 'review_submission' ||
          !['submitted', 'assigned', 'waiting_for_subject'].includes(record.status)
        )
          throw new AccessError(409, 'Only an open review case can request information');
        if (record.status === 'waiting_for_subject' && record.reason_code === 'missing_information')
          return;
        await client.query(
          "UPDATE moderation_case SET status='waiting_for_subject',reason_code='missing_information' WHERE id=$1",
          [caseId],
        );
        await this.audit(
          client,
          principal.userId,
          caseId,
          'moderation_case',
          'moderation-case-request_information',
        );
      });
      return;
    }
    await this.applyModerationAction(principal, caseId, {
      action: input.action,
      reasonCode: input.reasonCode,
      caseRevision: input.revision,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createContentReport(
    principal: Principal,
    input: ContentReportInput,
  ): Promise<ModerationCaseSummary> {
    if (
      !isModerationSubjectType(input.subjectType) ||
      !input.subjectId.trim() ||
      !isModerationReportCategory(input.category) ||
      (input.details !== undefined &&
        (input.details.trim().length < 20 || input.details.trim().length > 1200))
    ) {
      throw new AccessError(422, 'Report is invalid');
    }
    return this.transaction(principal, async (client) => {
      await this.ensureUser(client, principal.userId);
      await this.requireReportableSubject(client, input.subjectType, input.subjectId);
      const duplicate = await client.query(
        `SELECT 1
         FROM content_report
         JOIN moderation_case ON moderation_case.id = content_report.case_id
         WHERE content_report.reporter_user_id = $1
           AND moderation_case.subject_type = $2
           AND moderation_case.subject_id = $3
           AND moderation_case.status IN ('submitted', 'assigned', 'waiting_for_subject')
         LIMIT 1`,
        [principal.userId, input.subjectType, input.subjectId],
      );
      if (duplicate.rowCount) throw new AccessError(409, 'This content already has an open report');
      const id = randomUUID();
      await client.query(
        `INSERT INTO moderation_case (
           id, subject_type, subject_id, requester_user_id, priority, status
         ) VALUES ($1, $2, $3, $4, $5, 'submitted')`,
        [
          id,
          input.subjectType,
          input.subjectId,
          principal.userId,
          priorityForReport(input.category),
        ],
      );
      await client.query(
        `INSERT INTO content_report (case_id, reporter_user_id, category, details)
         VALUES ($1, $2, $3, $4)`,
        [id, principal.userId, input.category, input.details?.trim() ?? null],
      );
      await this.audit(client, principal.userId, id, 'moderation_case', 'content-report-submitted');
      return {
        id,
        priority: priorityForReport(input.category),
        status: 'submitted',
        subjectId: input.subjectId,
        subjectType: input.subjectType,
      };
    });
  }

  async assignModerationCase(
    admin: Principal,
    caseId: string,
    moderatorUserId: string,
  ): Promise<void> {
    this.requireAdmin(admin);
    await this.transaction(admin, async (client) => {
      await this.ensureUser(client, admin.userId);
      await assertStaffCandidate(client, moderatorUserId);
      const existing = await this.getCase(client, caseId, true);
      if (existing.kind !== 'report')
        throw new AccessError(409, 'This case uses its dedicated workflow');
      await this.requireNoConflict(client, existing, moderatorUserId);
      const result = await client.query<CaseRow>(
        `UPDATE moderation_case
         SET assigned_moderator_user_id = $2, status = 'assigned', updated_at = now()
         WHERE id = $1 AND status IN ('submitted', 'assigned')
         RETURNING *`,
        [caseId, moderatorUserId],
      );
      if (!result.rowCount)
        throw new AccessError(409, 'Only an open moderation case can be assigned');
      await this.audit(client, admin.userId, caseId, 'moderation_case', 'moderation-case-assigned');
    });
  }

  async applyModerationAction(
    principal: Principal,
    caseId: string,
    input: ModerationActionInput,
  ): Promise<ModerationCaseSummary> {
    if (!isModerationAction(input.action) || !isModerationReasonCode(input.reasonCode)) {
      throw new AccessError(422, 'Moderation action is invalid');
    }
    return this.transaction(principal, async (client) => {
      const record = await this.requireCaseAccess(client, principal, caseId, true);
      assertCaseRevision(record.revision, input.caseRevision);
      await this.requireNoConflict(client, record, principal.userId);
      if (record.kind !== 'report')
        throw new AccessError(409, 'Submission decisions use their dedicated verified workflow');
      if (
        input.action !== 'restore' &&
        !['submitted', 'assigned', 'waiting_for_subject'].includes(record.status)
      )
        throw new AccessError(409, 'The case already has a decision');
      if (record.subject_type === 'data_deletion') {
        throw new AccessError(409, 'Data deletion uses its dedicated workflow');
      }
      if (
        input.action === 'request_information' &&
        record.status === 'waiting_for_subject' &&
        record.reason_code === input.reasonCode
      )
        return toCaseSummary(record);
      if (input.action === 'temporarily_hide' || input.action === 'restore') {
        await this.changeSubjectVisibility(client, record, input.action);
      }
      const status: ModerationCaseStatus =
        input.action === 'request_information'
          ? 'waiting_for_subject'
          : input.action === 'reject'
            ? 'rejected'
            : 'resolved';
      const result = await client.query<CaseRow>(
        `UPDATE moderation_case
         SET status = $2, reason_code = $3,
             decided_by_user_id = CASE WHEN $5 THEN decided_by_user_id ELSE $4 END,
             appeal_against_user_id = CASE WHEN $5 THEN appeal_against_user_id ELSE NULL END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          caseId,
          status,
          input.reasonCode,
          principal.userId,
          input.action === 'request_information',
        ],
      );
      await this.audit(
        client,
        principal.userId,
        caseId,
        'moderation_case',
        `moderation-case-${input.action}`,
      );
      await this.audit(
        client,
        principal.userId,
        caseId,
        'moderation_case',
        `moderation-case-reason-${input.reasonCode}`,
      );
      return toCaseSummary(result.rows[0]!);
    });
  }

  async getModerationCase(principal: Principal, caseId: string): Promise<ModerationCaseDetail> {
    return this.transaction(principal, async (client) => {
      const record = await this.requireCaseAccess(client, principal, caseId);
      const report = await client.query<{
        readonly category: string;
        readonly details: string | null;
        readonly reporter_user_id: string;
      }>('SELECT category, details, reporter_user_id FROM content_report WHERE case_id = $1', [
        caseId,
      ]);
      return {
        ...toCaseSummary(record),
        createdAt: record.created_at.toISOString(),
        ...(report.rows[0]
          ? {
              report: {
                category: report.rows[0].category as ContentReportInput['category'],
                ...(report.rows[0].details ? { details: report.rows[0].details } : {}),
                reporterUserId: report.rows[0].reporter_user_id,
              },
            }
          : {}),
      };
    });
  }

  async listModerationQueue(principal: Principal): Promise<readonly ModerationCaseSummary[]> {
    if (!principal.roles.has('admin') && !principal.roles.has('moderator')) {
      throw new AccessError(403, 'Moderator access denied');
    }
    return this.transaction(principal, async (client) => {
      const isAdmin = principal.roles.has('admin');
      const cases = await client.query<CaseRow>(
        `SELECT * FROM moderation_case
         WHERE $1::boolean OR assigned_moderator_user_id = $2
         ORDER BY priority DESC, created_at, id`,
        [isAdmin, principal.userId],
      );
      return sortQueue(cases.rows.map(toCaseSummary));
    });
  }

  async listOwnModerationCases(principal: Principal): Promise<readonly ModerationCaseSummary[]> {
    return this.transaction(principal, async (client) => {
      const cases = await client.query<CaseRow>(
        `SELECT DISTINCT moderation_case.*
         FROM moderation_case
         LEFT JOIN content_report ON content_report.case_id = moderation_case.id
         LEFT JOIN garage_review ON (
           moderation_case.subject_type = 'review' AND garage_review.id = moderation_case.subject_id
         )
         LEFT JOIN membership ON (
           moderation_case.subject_type = 'garage_profile'
           AND membership.garage_id = moderation_case.subject_id
           AND membership.user_id = $1
           AND membership.state = 'active'
         )
         WHERE content_report.reporter_user_id = $1
           OR garage_review.author_user_id = $1
           OR membership.user_id = $1`,
        [principal.userId],
      );
      return sortQueue(cases.rows.map(toCaseSummary));
    });
  }

  async createAppeal(principal: Principal, input: AppealInput): Promise<string> {
    if (
      !input.caseId.trim() ||
      input.message.trim().length < 20 ||
      input.message.trim().length > 1200
    ) {
      throw new AccessError(422, 'Appeal is invalid');
    }
    return this.transaction(principal, async (client) => {
      await this.ensureUser(client, principal.userId);
      let record = await this.getCase(client, input.caseId);
      if (
        !['resolved', 'rejected'].includes(record.status) ||
        !(await this.canAppeal(client, principal, record))
      ) {
        throw new AccessError(403, 'Appeal is not available for this moderation case');
      }
      // The requester can read their case, but RLS deliberately forbids arbitrary case updates.
      // After that owner/member check, lock only this case in the existing transition context
      // and repeat the authorization/state check before writing. No client role is changed.
      await client.query("SELECT set_config('app.system_role','admin',true)");
      record = await this.getCase(client, input.caseId, true);
      if (
        !['resolved', 'rejected'].includes(record.status) ||
        !(await this.canAppeal(client, principal, record))
      )
        throw new AccessError(409, 'Appeal state changed while acquiring the case lock');
      const id = randomUUID();
      await client.query(
        `INSERT INTO moderation_appeal (id, case_id, appellant_user_id, message)
         VALUES ($1, $2, $3, $4)`,
        [id, record.id, principal.userId, input.message.trim()],
      );
      // The actor has just passed the owner/member check above. Only the server transitions the
      // case back into the queue; RLS otherwise keeps case mutation limited to staff.
      await client.query(`SELECT set_config('app.system_role', 'admin', true)`);
      await client.query(
        `UPDATE moderation_case
         SET status = 'submitted', reason_code = 'missing_information', updated_at = now(),
              appeal_against_user_id=decided_by_user_id,assigned_moderator_user_id=NULL,
              escalation_reason='requires_admin',escalated_at=now(),escalated_by_user_id=$2
         WHERE id = $1`,
        [record.id, principal.userId],
      );
      if (record.kind === 'review_submission')
        await client.query('DELETE FROM review_moderator_assignment WHERE review_id=$1', [
          record.subject_id,
        ]);
      await this.audit(
        client,
        principal.userId,
        record.id,
        'moderation_case',
        'moderation-appeal-submitted',
      );
      return id;
    });
  }

  async configureRetentionPolicy(
    admin: Principal,
    input: RetentionPolicyInput,
  ): Promise<RetentionPolicy> {
    this.requireAdmin(admin);
    const values = [
      input.reviewEvidenceRetentionDays,
      input.repairRequestRetentionDays,
      input.reportRetentionDays,
      input.auditLogRetentionDays,
    ];
    if (
      !input.version.trim() ||
      !input.operatorApprovalReference.trim() ||
      !['delete', 'retain_anonymized'].includes(input.publicReviewHandling) ||
      values.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 3650)
    ) {
      throw new AccessError(422, 'Retention policy is incomplete');
    }
    return this.transaction(admin, async (client) => {
      await this.ensureUser(client, admin.userId);
      const result = await client.query<{ readonly configured_at: Date }>(
        `INSERT INTO lifecycle_policy (
           version, operator_approval_reference, public_review_handling,
           review_evidence_retention_days, repair_request_retention_days, report_retention_days,
           audit_log_retention_days, configured_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING configured_at`,
        [
          input.version,
          input.operatorApprovalReference,
          input.publicReviewHandling,
          input.reviewEvidenceRetentionDays,
          input.repairRequestRetentionDays,
          input.reportRetentionDays,
          input.auditLogRetentionDays,
          admin.userId,
        ],
      );
      await client.query(
        `UPDATE data_deletion_request
         SET status = 'submitted', policy_version = $1
         WHERE status = 'blocked_by_policy' AND policy_version IS NULL`,
        [input.version],
      );
      await this.audit(
        client,
        admin.userId,
        input.version,
        'lifecycle_policy',
        'retention-policy-configured',
      );
      return { ...input, configuredAt: result.rows[0]!.configured_at.toISOString() };
    });
  }

  async exportPersonalData(principal: Principal): Promise<PersonalDataExport> {
    return this.transaction(principal, async (client) => {
      const favorites = await client.query<{ garage_id: string }>(
        'SELECT garage_id FROM garage_favorite WHERE owner_user_id = $1 ORDER BY created_at, garage_id',
        [principal.userId],
      );
      const files = await client.query<{
        readonly id: string;
        readonly retention_state: 'active' | 'deleted_after_retention';
      }>('SELECT id, retention_state FROM file_object WHERE owner_user_id = $1', [
        principal.userId,
      ]);
      const vehicles = await client.query<{ readonly id: string; readonly label: string }>(
        'SELECT id, label FROM vehicle WHERE owner_user_id = $1 ORDER BY created_at, id',
        [principal.userId],
      );
      const requests = await client.query<RepairRequestRow>(
        `SELECT id, service_category_id, symptom, earliest_dropoff_on, latest_pickup_on,
                created_at, active, revision, updated_at
         FROM repair_request WHERE owner_user_id = $1 ORDER BY created_at, id`,
        [principal.userId],
      );
      const reviews = await client.query<ReviewRow>(
        `SELECT review.id, review.garage_id, review.service_category_id,
                to_char(review.visit_month, 'YYYY-MM') AS visit_month, review.work_quality,
                review.communication, review.price_transparency, review.punctuality,
                review.publication_state, review.rejection_reason_code,
                evidence.verification_state AS evidence_status
         FROM garage_review AS review
         JOIN visit_evidence AS evidence ON evidence.review_id = review.id
         WHERE review.author_user_id = $1 ORDER BY review.submitted_at DESC`,
        [principal.userId],
      );
      const requestIds = requests.rows.map((request) => request.id as string);
      const areas = requestIds.length
        ? await client.query<{
            readonly place_id: string;
            readonly radius_m: number;
            readonly repair_request_id: string;
          }>(
            `SELECT repair_request_id, place_id, radius_m
             FROM request_search_area WHERE repair_request_id = ANY($1::text[])
             ORDER BY repair_request_id, position`,
            [requestIds],
          )
        : {
            rows: [] as readonly {
              place_id: string;
              radius_m: number;
              repair_request_id: string;
            }[],
          };
      const attachments = requestIds.length
        ? await client.query<{ readonly file_id: string; readonly repair_request_id: string }>(
            `SELECT repair_request_id, file_id
             FROM repair_request_attachment WHERE repair_request_id = ANY($1::text[])
             ORDER BY repair_request_id, file_id`,
            [requestIds],
          )
        : { rows: [] as readonly { file_id: string; repair_request_id: string }[] };
      return {
        exportedAt: new Date().toISOString(),
        favoriteGarageIds: favorites.rows.map((row) => row.garage_id),
        files: files.rows.map((file) => ({
          id: file.id,
          status: file.retention_state === 'active' ? ('active' as const) : ('deleted' as const),
        })),
        // Data-bearing request fields are intentionally returned only to their owner in this export.
        repairRequests: requests.rows.map((request) => ({
          active: request.active,
          revision: request.revision,
          updatedAt: request.updated_at.toISOString(),
          areas: areas.rows
            .filter((area) => area.repair_request_id === request.id)
            .map((area) => ({
              placeId: area.place_id as StoredRepairRequest['areas'][number]['placeId'],
              radiusKm: area.radius_m / 1000,
            })),
          attachmentIds: attachments.rows
            .filter((attachment) => attachment.repair_request_id === request.id)
            .map((attachment) => attachment.file_id),
          createdAt: request.created_at.toISOString(),
          earliestDropoffOn: toDate(request.earliest_dropoff_on),
          id: request.id,
          latestPickupOn: toDate(request.latest_pickup_on),
          serviceCategoryId: request.service_category_id,
          ...(request.symptom ? { symptom: request.symptom } : {}),
        })),
        reviews: reviews.rows.map(toOwnReview),
        vehicles: vehicles.rows,
      };
    });
  }

  async requestPersonalDataDeletion(principal: Principal): Promise<DataDeletionRequest> {
    return this.transaction(principal, async (client) => {
      await this.ensureUser(client, principal.userId);
      const existing = await client.query<DataDeletionRequestRow>(
        `SELECT id, user_id, policy_version, status, created_at
         FROM data_deletion_request
         WHERE user_id = $1 AND status <> 'completed'
         ORDER BY created_at DESC LIMIT 1`,
        [principal.userId],
      );
      if (existing.rows[0]) return normalizeDeletionRequest(existing.rows[0]);
      const policy = await client.query<{ readonly version: string }>(
        'SELECT version FROM lifecycle_policy ORDER BY configured_at DESC LIMIT 1',
      );
      const ownedGarage = await client.query(
        `SELECT 1 FROM membership
         WHERE user_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1`,
        [principal.userId],
      );
      const id = randomUUID();
      const status: DataDeletionRequest['status'] = ownedGarage.rowCount
        ? 'manual_content_decision_required'
        : policy.rowCount
          ? 'submitted'
          : 'blocked_by_policy';
      const policyVersion = policy.rows[0]?.version;
      await client.query(
        `INSERT INTO data_deletion_request (id, user_id, policy_version, status)
         VALUES ($1, $2, $3, $4)`,
        [id, principal.userId, policyVersion ?? null, status],
      );
      await client.query(
        `INSERT INTO moderation_case (
           id, subject_type, subject_id, requester_user_id, priority, status
         ) VALUES ($1, 'data_deletion', $1, $2, 'normal', $3)`,
        [id, principal.userId, status === 'submitted' ? 'submitted' : 'waiting_for_subject'],
      );
      await this.audit(
        client,
        principal.userId,
        id,
        'data_deletion_request',
        'personal-data-deletion-requested',
      );
      return {
        createdAt: new Date().toISOString(),
        id,
        policyVersion,
        status,
        userId: principal.userId,
      };
    });
  }

  async listDataDeletionRequests(admin: Principal): Promise<readonly DataDeletionRequest[]> {
    this.requireAdmin(admin);
    return this.transaction(admin, async (client) => {
      const rows = await client.query<DataDeletionRequestRow>(
        `SELECT id, user_id, policy_version, status, created_at
         FROM data_deletion_request ORDER BY created_at, id`,
      );
      return rows.rows.map(normalizeDeletionRequest);
    });
  }

  async processPersonalDataDeletion(
    admin: Principal,
    requestId: string,
  ): Promise<DataDeletionCompletion> {
    this.requireAdmin(admin);
    return this.transaction(admin, async (client) => {
      const request = await client.query<{
        readonly policy_version: string | null;
        readonly status: DataDeletionRequest['status'];
        readonly user_id: string;
      }>(
        'SELECT user_id, policy_version, status FROM data_deletion_request WHERE id = $1 FOR UPDATE',
        [requestId],
      );
      const row = request.rows[0];
      if (!row) throw new AccessError(404, 'Data deletion request not found');
      if (row.status !== 'submitted' || !row.policy_version) {
        throw new AccessError(409, 'Data deletion requires the configured operator policy');
      }
      const policy = await client.query<{
        readonly public_review_handling: 'delete' | 'retain_anonymized';
      }>('SELECT public_review_handling FROM lifecycle_policy WHERE version = $1', [
        row.policy_version,
      ]);
      if (!policy.rows[0])
        throw new AccessError(409, 'Data deletion requires the configured operator policy');
      const userId = row.user_id;
      // Serialize account erasure with new favorites, which take a shared owner lock.
      await client.query('SELECT id FROM app_user WHERE id = $1 FOR UPDATE', [userId]);
      const files = await client.query<{ readonly id: string; readonly storage_key: string }>(
        "SELECT id, storage_key FROM file_object WHERE owner_user_id = $1 AND retention_state = 'active'",
        [userId],
      );
      for (const file of files.rows) {
        await client.query(
          `UPDATE file_object SET retention_state = 'deleted_after_retention' WHERE id = $1`,
          [file.id],
        );
        await client.query(
          `INSERT INTO object_deletion_task (id, file_id, storage_key)
           VALUES ($1, $2, $3) ON CONFLICT (file_id) DO NOTHING`,
          [randomUUID(), file.id, file.storage_key],
        );
      }
      const reviews = await client.query<{
        readonly id: string;
        readonly publication_state: string;
      }>('SELECT id, publication_state FROM garage_review WHERE author_user_id = $1', [userId]);
      const retained = reviews.rows.filter(
        (review) =>
          review.publication_state === 'published' &&
          policy.rows[0]!.public_review_handling === 'retain_anonymized',
      );
      if (retained.length) {
        const anonymousUserId = `anonymized-review-author-${randomUUID()}`;
        await client.query(
          `INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $2, 'suspended')`,
          [anonymousUserId, `anonymized-${randomUUID()}`],
        );
        await client.query(
          `UPDATE garage_review SET author_user_id = $2
           WHERE id = ANY($1::text[])`,
          [retained.map((review) => review.id), anonymousUserId],
        );
        await client.query(
          `UPDATE visit_evidence SET verification_state = 'deleted_after_retention', deleted_at = now()
           WHERE review_id = ANY($1::text[])`,
          [retained.map((review) => review.id)],
        );
      }
      const removableReviewIds = reviews.rows
        .filter((review) => !retained.some((kept) => kept.id === review.id))
        .map((review) => review.id);
      if (removableReviewIds.length) {
        await client.query('DELETE FROM review_update WHERE review_id = ANY($1::text[])', [
          removableReviewIds,
        ]);
        await client.query('DELETE FROM review_garage_response WHERE review_id = ANY($1::text[])', [
          removableReviewIds,
        ]);
        await client.query(
          'DELETE FROM review_moderator_assignment WHERE review_id = ANY($1::text[])',
          [removableReviewIds],
        );
        await client.query('DELETE FROM visit_evidence WHERE review_id = ANY($1::text[])', [
          removableReviewIds,
        ]);
        await client.query('DELETE FROM garage_review WHERE id = ANY($1::text[])', [
          removableReviewIds,
        ]);
      }
      await client.query(
        `DELETE FROM repair_request_attachment
         WHERE repair_request_id IN (SELECT id FROM repair_request WHERE owner_user_id = $1)`,
        [userId],
      );
      await client.query(
        `DELETE FROM request_search_area
         WHERE repair_request_id IN (SELECT id FROM repair_request WHERE owner_user_id = $1)`,
        [userId],
      );
      await client.query('DELETE FROM repair_request WHERE owner_user_id = $1', [userId]);
      await client.query('DELETE FROM vehicle WHERE owner_user_id = $1', [userId]);
      // The admin has authorized this erasure; keep the favorite table's owner-only RLS intact.
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query('DELETE FROM garage_favorite WHERE owner_user_id = $1', [userId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [admin.userId]);
      await client.query('DELETE FROM moderation_appeal WHERE appellant_user_id = $1', [userId]);
      await client.query('UPDATE content_report SET details = NULL WHERE reporter_user_id = $1', [
        userId,
      ]);
      await client.query("UPDATE membership SET state = 'revoked' WHERE user_id = $1", [userId]);
      await client.query(
        `UPDATE app_user SET status = 'suspended', oidc_subject = $2 WHERE id = $1`,
        [userId, `erased-${randomUUID()}`],
      );
      await client.query(
        `UPDATE data_deletion_request SET status = 'completed', completed_at = now() WHERE id = $1`,
        [requestId],
      );
      await client.query(
        `UPDATE moderation_case
         SET status = 'resolved', reason_code = 'no_violation', updated_at = now() WHERE id = $1`,
        [requestId],
      );
      await this.audit(
        client,
        admin.userId,
        requestId,
        'data_deletion_request',
        'personal-data-deletion-completed',
      );
      return { fileIds: files.rows.map((file) => file.id), userId };
    });
  }

  private async canAppeal(
    client: pg.PoolClient,
    principal: Principal,
    record: CaseRow,
  ): Promise<boolean> {
    if (record.requester_user_id === principal.userId) return true;
    if (record.subject_type === 'review') {
      const review = await client.query(
        'SELECT 1 FROM garage_review WHERE id = $1 AND author_user_id = $2',
        [record.subject_id, principal.userId],
      );
      return Boolean(review.rowCount);
    }
    if (record.subject_type === 'garage_profile') {
      const member = await client.query(
        `SELECT 1 FROM membership
         WHERE garage_id = $1 AND user_id = $2 AND state = 'active'`,
        [record.subject_id, principal.userId],
      );
      return Boolean(member.rowCount);
    }
    return false;
  }

  private async requireNoConflict(
    client: pg.PoolClient,
    record: CaseRow,
    userId: string,
  ): Promise<void> {
    if (record.requester_user_id === userId || record.appeal_against_user_id === userId)
      throw new AccessError(403, 'A person involved in a case cannot decide it');
    const result = await client.query(
      `SELECT 1 FROM membership WHERE user_id=$1 AND state='active' AND garage_id=
      CASE WHEN $2='garage_profile' THEN $3 ELSE (SELECT garage_id FROM garage_review WHERE id=$3) END`,
      [userId, record.subject_type, record.subject_id],
    );
    const author =
      record.subject_type === 'review'
        ? await client.query('SELECT 1 FROM garage_review WHERE id=$1 AND author_user_id=$2', [
            record.subject_id,
            userId,
          ])
        : undefined;
    if (result.rowCount || author?.rowCount)
      throw new AccessError(403, 'A person involved in a case cannot decide it');
  }

  private async changeSubjectVisibility(
    client: pg.PoolClient,
    record: CaseRow,
    action: 'temporarily_hide' | 'restore',
  ): Promise<void> {
    if (record.subject_type === 'review') {
      const expected = action === 'temporarily_hide' ? 'published' : 'temporarily_hidden';
      const target = action === 'temporarily_hide' ? 'temporarily_hidden' : 'published';
      const updated = await client.query(
        `UPDATE garage_review r SET publication_state=$2,moderation_hidden_case_id=$4
        WHERE r.id=$1 AND r.publication_state=$3 AND r.published_at IS NOT NULL
          AND ($5::boolean OR (r.moderation_hidden_case_id=$6 AND EXISTS (
            SELECT 1 FROM visit_evidence e JOIN file_object f ON f.id=e.private_file_id
            WHERE e.review_id=r.id AND ((e.verification_state='verified' AND e.service_matches IS TRUE
              AND e.visit_month_matches IS TRUE AND e.garage_matches IS TRUE AND f.scan_state='clean' AND f.retention_state='active')
              OR e.verification_state='deleted_after_retention'))))`,
        [
          record.subject_id,
          target,
          expected,
          action === 'temporarily_hide' ? record.id : null,
          action === 'temporarily_hide',
          record.id,
        ],
      );
      if (!updated.rowCount)
        throw new AccessError(409, 'This review cannot take the requested visibility action');
      return;
    }
    const hidden = action === 'temporarily_hide';
    const updated = await client.query(
      `UPDATE garage g SET publication_state=$2,moderation_hidden_case_id=$4
      WHERE g.id=$1 AND g.publication_state=$3 AND g.deleted_at IS NULL
        AND ($5::boolean OR (g.moderation_hidden_case_id=$6 AND EXISTS (
          SELECT 1 FROM garage_verification v WHERE v.garage_id=g.id AND v.phone_state='verified'
            AND v.contact_person_state='verified' AND v.company_document_state='verified' AND v.location_state='verified')))`,
      [
        record.subject_id,
        hidden ? 'suspended' : 'published',
        hidden ? 'published' : 'suspended',
        hidden ? record.id : null,
        hidden,
        record.id,
      ],
    );
    if (!updated.rowCount)
      throw new AccessError(409, 'This garage cannot take the requested visibility action');
  }

  private async getCase(client: pg.PoolClient, caseId: string, lock = false): Promise<CaseRow> {
    const result = await client.query<CaseRow>(
      `SELECT * FROM moderation_case WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [caseId],
    );
    if (!result.rows[0]) throw new AccessError(404, 'Moderation case not found');
    return result.rows[0];
  }

  private async requireCaseAccess(
    client: pg.PoolClient,
    principal: Principal,
    caseId: string,
    lock = false,
  ): Promise<CaseRow> {
    const record = await this.getCase(client, caseId, lock);
    if (principal.roles.has('admin')) return record;
    if (
      principal.roles.has('moderator') &&
      !record.escalation_reason &&
      record.assigned_moderator_user_id === principal.userId
    )
      return record;
    throw new AccessError(403, 'Moderator access denied for this case');
  }

  private async requireReportableSubject(
    client: pg.PoolClient,
    subjectType: ModerationSubjectType,
    subjectId: string,
  ): Promise<void> {
    const result =
      subjectType === 'review'
        ? await client.query('SELECT 1 FROM public_garage_review WHERE id = $1', [subjectId])
        : await client.query('SELECT 1 FROM public_garage_profile WHERE id = $1', [subjectId]);
    if (!result.rowCount) throw new AccessError(404, 'Published content not found');
  }

  private async ensureUser(client: pg.PoolClient, userId: string): Promise<void> {
    await client.query(
      `INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $1, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [userId],
    );
  }

  private requireAdmin(principal: Principal): void {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
  }

  private async audit(
    client: pg.PoolClient,
    actorUserId: string,
    subjectId: string,
    subjectType: string,
    eventType: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO moderation_event (id, actor_user_id, subject_type, subject_id, event_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), actorUserId, subjectType, subjectId, eventType],
    );
  }

  private async transaction<T>(
    principal: Principal,
    callback: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [principal.userId]);
      const systemRole = principal.roles.has('admin')
        ? 'admin'
        : principal.roles.has('moderator')
          ? 'moderator'
          : '';
      await client.query(`SELECT set_config('app.system_role', $1, true)`, [systemRole]);
      await assertCurrentStaffIdentity(client, principal);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function toCaseSummary(row: CaseRow): ModerationCaseSummary {
  return {
    ...(row.assigned_moderator_user_id
      ? { assignedModeratorUserId: row.assigned_moderator_user_id }
      : {}),
    id: row.id,
    priority: row.priority,
    ...(row.reason_code ? { reasonCode: row.reason_code } : {}),
    status: row.status,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
  };
}

function toDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

function toOwnReview(row: ReviewRow): OwnReview {
  const ratings = {
    communication: row.communication,
    priceTransparency: row.price_transparency,
    punctuality: row.punctuality,
    workQuality: row.work_quality,
  };
  return {
    evidenceStatus: row.evidence_status,
    id: row.id,
    publicationState: row.publication_state,
    ...(row.rejection_reason_code ? { rejectionReason: row.rejection_reason_code } : {}),
    ratings: { ...ratings, overall: calculateOverallRating(ratings) },
    serviceCategoryId: row.service_category_id,
    visitMonth: row.visit_month,
    garageId: row.garage_id,
  };
}

function normalizeDeletionRequest(row: DataDeletionRequestRow): DataDeletionRequest {
  return {
    createdAt: row.created_at.toISOString(),
    id: row.id,
    ...(row.policy_version ? { policyVersion: row.policy_version } : {}),
    status: row.status,
    userId: row.user_id,
  };
}

function sortQueue(summaries: readonly ModerationCaseSummary[]): readonly ModerationCaseSummary[] {
  return [...summaries].sort(
    (left, right) =>
      Number(right.priority === 'high') - Number(left.priority === 'high') ||
      left.id.localeCompare(right.id),
  );
}
