import pg from 'pg';
import { AccessError, type Principal } from './access';
import type { AccountProfile } from '../shared/account';
import {
  STAFF_ESCALATION_REASONS,
  type StaffCaseSummary,
  type StaffCaseDetail,
  type StaffCaseKind,
  type StaffModerator,
  type StaffQueueFilter,
  type StaffQueuePage,
  type StaffCaseAssignment,
  type StaffCaseEscalation,
  type StaffEscalationReason,
  type ModerationCaseStatus,
  type ModerationPriority,
  type ModerationReasonCode,
  type ModerationReportCategory,
} from '../shared/moderation';
import {
  assertCurrentStaffIdentity,
  assertStaffCandidate,
  recordVerifiedStaffIdentity,
} from './staff-identity';
import { randomUUID } from 'node:crypto';

interface CaseRow {
  id: string;
  kind: StaffCaseKind;
  subject_type: StaffCaseSummary['subjectType'];
  subject_id: string;
  requester_user_id: string | null;
  assigned_moderator_user_id: string | null;
  status: ModerationCaseStatus;
  priority: ModerationPriority;
  reason_code: ModerationReasonCode | null;
  created_at: Date;
  updated_at: Date;
  revision: number;
  label?: string | null;
  assigned_label?: string | null;
  escalation_reason: StaffEscalationReason | null;
  escalated_at: Date | null;
  appeal_against_user_id: string | null;
}
const pageSize = 20;
const activeStatuses = ['submitted', 'assigned', 'waiting_for_subject'];

/** Bounded projections and hand-offs over the existing case/review tables, not another workflow. */
export class PostgresStaffWorkspace {
  constructor(private readonly pool: pg.Pool) {}

  async validate(principal: Principal): Promise<void> {
    await this.transaction(principal, async () => undefined);
  }

  async recordVerifiedIdentity(
    userId: string,
    roles: readonly ('admin' | 'moderator')[],
    profile: AccountProfile,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await recordVerifiedStaffIdentity(client, userId, roles, profile);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async list(principal: Principal, filter: StaffQueueFilter): Promise<StaffQueuePage> {
    const page = filter.page ?? 1;
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
      throw new AccessError(400, 'Invalid case page');
    return this.transaction(principal, async (client) => {
      const result = await client.query<CaseRow>(
        `SELECT c.*,COALESCE(g.name,rg.name) AS label,s.display_name AS assigned_label
        FROM moderation_case c
        LEFT JOIN public_garage_profile g ON c.subject_type='garage_profile' AND g.id=c.subject_id
        LEFT JOIN garage_review r ON c.subject_type='review' AND r.id=c.subject_id
        LEFT JOIN public_garage_profile rg ON rg.id=r.garage_id
        LEFT JOIN staff_identity s ON s.user_id=c.assigned_moderator_user_id
        WHERE ($1::boolean OR (c.assigned_moderator_user_id=$2 AND c.escalation_reason IS NULL))
          AND ($3::text IS NULL OR c.kind=$3) AND ($4::text IS NULL OR c.status=$4)
          AND ($5::text IS NULL OR c.priority=$5) AND ($6::boolean IS NULL OR (c.escalation_reason IS NOT NULL)=$6)
        ORDER BY (c.priority='high') DESC,c.created_at,c.id LIMIT $7 OFFSET $8`,
        [
          principal.roles.has('admin'),
          principal.userId,
          filter.kind ?? null,
          filter.status ?? null,
          filter.priority ?? null,
          filter.escalated ?? null,
          pageSize + 1,
          (page - 1) * pageSize,
        ],
      );
      return {
        cases: result.rows.slice(0, pageSize).map(summary),
        page,
        hasMore: result.rows.length > pageSize,
      };
    });
  }

  async moderators(principal: Principal): Promise<readonly StaffModerator[]> {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    return this.transaction(principal, async (client) => {
      const result = await client.query<{
        user_id: string;
        display_name: string;
      }>(`SELECT s.user_id,s.display_name
        FROM staff_identity s JOIN app_user u ON u.id=s.user_id
        WHERE u.status='active' AND 'moderator'=ANY(s.verified_roles) ORDER BY s.display_name,s.user_id LIMIT 100`);
      return result.rows.map((row) => ({ userId: row.user_id, label: row.display_name }));
    });
  }

  async get(principal: Principal, caseId: string): Promise<StaffCaseDetail> {
    return this.transaction(principal, async (client) => {
      const row = await this.case(client, principal, caseId);
      const conflict = await this.conflict(client, row, principal.userId);
      const [report, history, appeals] = await Promise.all([
        await client.query<{ category: ModerationReportCategory; details: string | null }>(
          'SELECT category,details FROM content_report WHERE case_id=$1',
          [caseId],
        ),
        await client.query<{ event_type: string; created_at: Date }>(
          'SELECT event_type,created_at FROM staff_case_event WHERE case_id=$1 ORDER BY created_at,id LIMIT 100',
          [caseId],
        ),
        await client.query<{ message: string; created_at: Date }>(
          'SELECT message,created_at FROM moderation_appeal WHERE case_id=$1 ORDER BY created_at,id LIMIT 20',
          [caseId],
        ),
      ]);
      let review: StaffCaseDetail['review'];
      let garage: StaffCaseDetail['garage'];
      if (row.subject_type === 'review') {
        const result = await client.query<{
          review_text: string;
          visit_month: string;
          service_category_id: string;
          garage_id: string;
          garage_name: string | null;
          publication_state: string;
          verification_state: string;
          evidence_kind: string;
          work_quality: number;
          communication: number;
          price_transparency: number;
          punctuality: number;
        }>(
          `SELECT r.review_text,to_char(r.visit_month,'YYYY-MM') AS visit_month,r.service_category_id,r.garage_id,g.name AS garage_name,
             r.publication_state,e.verification_state,e.evidence_kind,r.work_quality,r.communication,r.price_transparency,r.punctuality
           FROM garage_review r LEFT JOIN visit_evidence e ON e.review_id=r.id
           LEFT JOIN public_garage_profile g ON g.id=r.garage_id WHERE r.id=$1`,
          [row.subject_id],
        );
        const r = result.rows[0];
        if (r)
          review = {
            text: r.review_text,
            visitMonth: r.visit_month,
            serviceCategoryId: r.service_category_id,
            garageId: r.garage_id,
            garageName: r.garage_name ?? '',
            publicationState: r.publication_state,
            evidenceStatus: r.verification_state ?? 'unavailable',
            evidenceKind: r.evidence_kind ?? 'unavailable',
            ratings: {
              workQuality: r.work_quality,
              communication: r.communication,
              priceTransparency: r.price_transparency,
              punctuality: r.punctuality,
            },
          };
      } else if (row.subject_type === 'garage_profile') {
        const result = await client.query<{
          name: string;
          place_id: string;
          publication_state: string;
        }>(
          'SELECT name,place_id,publication_state FROM garage WHERE id=$1 AND deleted_at IS NULL',
          [row.subject_id],
        );
        const g = result.rows[0];
        if (g)
          garage = { name: g.name, placeId: g.place_id, publicationState: g.publication_state };
      }
      return {
        ...summary(row),
        label: garage?.name || review?.garageName || '',
        ...(report.rows[0]
          ? {
              report: {
                category: report.rows[0].category,
                ...(report.rows[0].details ? { details: report.rows[0].details } : {}),
              },
            }
          : {}),
        ...(review ? { review } : {}),
        ...(garage ? { garage } : {}),
        history: history.rows.map((e) => ({
          action: e.event_type,
          createdAt: e.created_at.toISOString(),
        })),
        appeals: appeals.rows.map((a) => ({
          message: a.message,
          createdAt: a.created_at.toISOString(),
        })),
        conflictOfInterest: conflict,
        canAssign:
          principal.roles.has('admin') &&
          activeStatuses.includes(row.status) &&
          ['report', 'review_submission'].includes(row.kind),
        canEscalate:
          row.assigned_moderator_user_id === principal.userId &&
          !row.escalation_reason &&
          activeStatuses.includes(row.status),
      };
    });
  }

  async assign(principal: Principal, caseId: string, input: StaffCaseAssignment): Promise<void> {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    return this.transaction(principal, async (client) => {
      const row = await this.case(client, principal, caseId, true);
      checkRevision(row, input.revision);
      if (
        !activeStatuses.includes(row.status) ||
        !['report', 'review_submission'].includes(row.kind)
      )
        throw new AccessError(409, 'Only open review or report cases can be assigned');
      await assertStaffCandidate(client, input.moderatorUserId);
      if (await this.conflict(client, row, input.moderatorUserId))
        throw new AccessError(409, 'The assignee is involved in this case');
      if (row.assigned_moderator_user_id === input.moderatorUserId && !row.escalation_reason)
        return;
      if (row.kind === 'review_submission') {
        const review = await client.query<{ publication_state: string }>(
          'SELECT publication_state FROM garage_review WHERE id=$1 FOR UPDATE',
          [row.subject_id],
        );
        if (!['submitted', 'under_review'].includes(review.rows[0]?.publication_state ?? ''))
          throw new AccessError(409, 'Review is no longer awaiting a decision');
        await client.query(
          `INSERT INTO review_moderator_assignment(review_id,moderator_user_id,assigned_by_user_id)
          VALUES($1,$2,$3) ON CONFLICT(review_id) DO UPDATE SET moderator_user_id=EXCLUDED.moderator_user_id,
          assigned_by_user_id=EXCLUDED.assigned_by_user_id,assigned_at=now()`,
          [row.subject_id, input.moderatorUserId, principal.userId],
        );
        await client.query(
          "UPDATE garage_review SET publication_state='under_review' WHERE id=$1",
          [row.subject_id],
        );
        await client.query(
          "UPDATE visit_evidence SET verification_state='under_review' WHERE review_id=$1",
          [row.subject_id],
        );
      }
      await client.query(
        `UPDATE moderation_case SET assigned_moderator_user_id=$2,
        status=CASE WHEN status='waiting_for_subject' THEN status ELSE 'assigned' END,
        escalation_reason=NULL,escalated_at=NULL,escalated_by_user_id=NULL WHERE id=$1`,
        [caseId, input.moderatorUserId],
      );
      await this.audit(client, principal.userId, caseId, 'staff-case-assigned');
    });
  }

  async escalate(principal: Principal, caseId: string, input: StaffCaseEscalation): Promise<void> {
    if (!STAFF_ESCALATION_REASONS.includes(input.reason))
      throw new AccessError(422, 'Invalid escalation reason');
    return this.transaction(principal, async (client) => {
      const row = await this.case(client, principal, caseId, true);
      checkRevision(row, input.revision);
      if (
        row.assigned_moderator_user_id !== principal.userId ||
        row.escalation_reason ||
        !activeStatuses.includes(row.status)
      )
        throw new AccessError(
          409,
          'Only a currently assigned open case can be returned to administration',
        );
      // This authorized transition relinquishes the actor's assignment. The temporary database
      // context is confined to this transaction; it cannot confer an application admin role.
      await client.query("SELECT set_config('app.system_role','admin',true)");
      if (row.kind === 'review_submission')
        await client.query('DELETE FROM review_moderator_assignment WHERE review_id=$1', [
          row.subject_id,
        ]);
      await client.query(
        `UPDATE moderation_case SET assigned_moderator_user_id=NULL,status='submitted',
        escalation_reason=$2,escalated_at=now(),escalated_by_user_id=$3 WHERE id=$1`,
        [caseId, input.reason, principal.userId],
      );
      await this.audit(client, principal.userId, caseId, `staff-case-escalated-${input.reason}`);
    });
  }

  private async case(
    client: pg.PoolClient,
    principal: Principal,
    id: string,
    lock = false,
  ): Promise<CaseRow> {
    const result = await client.query<CaseRow>(
      `SELECT * FROM moderation_case WHERE id=$1
      AND ($2::boolean OR (assigned_moderator_user_id=$3 AND escalation_reason IS NULL))${lock ? ' FOR UPDATE' : ''}`,
      [id, principal.roles.has('admin'), principal.userId],
    );
    if (!result.rows[0]) throw new AccessError(404, 'Moderation case not found');
    return result.rows[0];
  }
  private async conflict(client: pg.PoolClient, row: CaseRow, userId: string): Promise<boolean> {
    if (row.requester_user_id === userId || row.appeal_against_user_id === userId) return true;
    if (row.subject_type === 'data_deletion') return true;
    const result = await client.query(
      `SELECT 1 FROM membership m WHERE m.user_id=$1 AND m.state='active' AND
      m.garage_id=CASE WHEN $2='garage_profile' THEN $3 ELSE (SELECT garage_id FROM garage_review WHERE id=$3) END`,
      [userId, row.subject_type, row.subject_id],
    );
    if (result.rowCount) return true;
    if (row.subject_type === 'review') {
      const author = await client.query(
        'SELECT 1 FROM garage_review WHERE id=$1 AND author_user_id=$2',
        [row.subject_id, userId],
      );
      return Boolean(author.rowCount);
    }
    return false;
  }
  private async audit(
    client: pg.PoolClient,
    actor: string,
    id: string,
    action: string,
  ): Promise<void> {
    await client.query(
      "INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type) VALUES($1,$2,'moderation_case',$3,$4)",
      [randomUUID(), actor, id, action],
    );
  }
  private async transaction<T>(
    principal: Principal,
    run: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!principal.roles.has('admin') && !principal.roles.has('moderator'))
      throw new AccessError(403, 'Staff access denied');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.system_role',$2,true)",
        [principal.userId, principal.roles.has('admin') ? 'admin' : 'moderator'],
      );
      await assertCurrentStaffIdentity(client, principal);
      const value = await run(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
function checkRevision(row: CaseRow, revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new AccessError(422, 'A case revision is required');
  if (row.revision !== revision)
    throw new AccessError(409, 'The case has changed; reload before deciding');
}
function summary(row: CaseRow): StaffCaseSummary {
  return {
    id: row.id,
    kind: row.kind,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    status: row.status,
    priority: row.priority,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    label: row.label ?? '',
    ...(row.assigned_moderator_user_id
      ? { assignedModeratorUserId: row.assigned_moderator_user_id }
      : {}),
    ...(row.assigned_label ? { assignedModeratorLabel: row.assigned_label } : {}),
    ...(row.reason_code ? { reasonCode: row.reason_code } : {}),
    ...(row.escalation_reason && row.escalated_at
      ? { escalation: { reason: row.escalation_reason, createdAt: row.escalated_at.toISOString() } }
      : {}),
  };
}
