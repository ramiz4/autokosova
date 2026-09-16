import { assertCurrentStaffIdentity, assertStaffCandidate } from './staff-identity';
import { assertCaseRevision } from './staff-case-revision';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { FileGrant, Principal } from './access';
import { AccessError } from './access';
import {
  validReviewSubmission,
  REVIEW_LIMITS,
  REVIEW_PAGE_SIZE,
  type OwnReviewDetail,
  type OwnReviewListFilter,
  type OwnReviewPage,
  type PublicReviewPage,
} from '../shared/reviews';
import {
  calculateOverallRating,
  isReviewRejectionReason,
  isReviewUpdateKind,
  type OwnReview,
  type PublicGarageReview,
  type ReviewDecisionInput,
  type ReviewPublicFilter,
  type ReviewStore,
  type ReviewSubmissionInput,
  type ReviewUpdateKind,
} from './reviews';

interface ReviewRow {
  readonly author_user_id: string;
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

interface PublicReviewRow {
  readonly communication: number;
  readonly id: string;
  readonly overall_rating: number | string;
  readonly price_transparency: number;
  readonly published_at: Date;
  readonly punctuality: number;
  readonly review_text: string;
  readonly service_category_id: string;
  readonly vehicle_make_id: string | null;
  readonly visit_month: string;
  readonly work_quality: number;
}

interface ReviewAccessRow extends ReviewRow {
  readonly scan_state: string;
  readonly appeal_against_user_id: string | null;
  readonly evidence_file_id: string;
  readonly evidence_status: OwnReview['evidenceStatus'];
  readonly moderator_user_id: string | null;
  readonly retention_state: 'active' | 'deleted_after_retention';
}

interface PublicResponseRow {
  readonly revision: number;
  readonly updated_at: Date;
  readonly created_at: Date;
  readonly response_text: string;
}

interface PublicUpdateRow {
  readonly created_at: Date;
  readonly update_kind: ReviewUpdateKind;
  readonly update_text: string;
}

/**
 * Durable review repository. The file content still belongs to the configured private object
 * storage adapter; this repository keeps only the private file reference and refuses anything
 * that has not been marked clean by that adapter.
 */
export class PostgresReviewStore implements ReviewStore {
  private readonly pool: pg.Pool;
  private readonly ownsPool: boolean;

  constructor(database: string | pg.Pool) {
    this.ownsPool = typeof database === 'string';
    this.pool =
      typeof database === 'string' ? new pg.Pool({ connectionString: database }) : database;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  async assignModerator(
    admin: Principal,
    reviewId: string,
    moderatorUserId: string,
  ): Promise<void> {
    this.requireAdmin(admin);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, admin);
      await this.ensureUser(client, admin.userId);
      await assertStaffCandidate(client, moderatorUserId);
      await client.query('SELECT id FROM moderation_case WHERE id=$1 FOR UPDATE', [
        `review:${reviewId}`,
      ]);
      const review = await this.getReviewAccess(client, reviewId, true);
      if (review.publication_state !== 'submitted') {
        throw new AccessError(409, 'Only submitted reviews can be assigned for review');
      }
      await this.requireNoReviewInterest(client, review, moderatorUserId);
      if (review.author_user_id === moderatorUserId) {
        throw new AccessError(409, 'A reviewer cannot be assigned to their own review');
      }
      await client.query(
        `INSERT INTO review_moderator_assignment (
           review_id, moderator_user_id, assigned_by_user_id
         ) VALUES ($1, $2, $3)
         ON CONFLICT (review_id) DO UPDATE
         SET moderator_user_id = EXCLUDED.moderator_user_id,
             assigned_by_user_id = EXCLUDED.assigned_by_user_id,
             assigned_at = now()`,
        [reviewId, moderatorUserId, admin.userId],
      );
      await client.query(
        `UPDATE garage_review SET publication_state = 'under_review' WHERE id = $1`,
        [reviewId],
      );
      await client.query(
        `UPDATE visit_evidence SET verification_state = 'under_review' WHERE review_id = $1`,
        [reviewId],
      );
      await this.audit(client, admin.userId, reviewId, 'review-moderator-assigned');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createReview(principal: Principal, input: ReviewSubmissionInput): Promise<OwnReview> {
    if (!validReviewSubmission(input))
      throw new AccessError(422, 'Invalid review submission', 'review_invalid');
    if (principal.roles.has('admin')) {
      throw new AccessError(403, 'An admin cannot submit a review on behalf of a customer');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      await this.ensureUser(client, principal.userId);
      const garage = await client.query<{ available: boolean }>(
        'SELECT review_lock_public_garage($1) AS available',
        [input.garageId],
      );
      if (!garage.rows[0]?.available) throw new AccessError(404, 'Published garage not found');
      const membership = await client.query(
        "SELECT 1 FROM membership WHERE garage_id=$1 AND user_id=$2 AND state='active' FOR SHARE",
        [input.garageId, principal.userId],
      );
      if (membership.rowCount)
        throw new AccessError(403, 'You cannot review your own garage', 'self_review');
      const active = await client.query(
        "SELECT 1 FROM app_user WHERE id=$1 AND status='active' FOR SHARE",
        [principal.userId],
      );
      if (!active.rowCount) throw new AccessError(403, 'Active account required');
      // The owned evidence file is the visit key. Separate files permit separate actual visits.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        JSON.stringify([principal.userId, input.evidenceFileId]),
      ]);
      const existing = await client.query<Record<string, unknown>>(
        `SELECT r.*,to_char(r.visit_month,'YYYY-MM') AS visit_month,e.evidence_kind,e.verification_state AS evidence_status
         FROM garage_review r JOIN visit_evidence e ON e.review_id=r.id WHERE e.private_file_id=$1 AND r.author_user_id=$2`,
        [input.evidenceFileId, principal.userId],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (
          row['garage_id'] !== input.garageId ||
          row['service_category_id'] !== input.serviceCategoryId ||
          (row['vehicle_make_id'] ?? undefined) !== input.vehicleMakeId ||
          row['visit_month'] !== input.visitMonth ||
          row['review_text'] !== input.text.trim() ||
          row['evidence_kind'] !== input.evidenceKind ||
          row['work_quality'] !== input.workQuality ||
          row['communication'] !== input.communication ||
          row['price_transparency'] !== input.priceTransparency ||
          row['punctuality'] !== input.punctuality
        )
          throw new AccessError(
            409,
            'This visit evidence already belongs to another submission',
            'evidence_already_used',
          );
        await client.query('COMMIT');
        return toOwnReview(row as unknown as ReviewRow);
      }
      const file = await client.query<{ id: string }>(
        `SELECT id
         FROM file_object
         WHERE id = $1 AND owner_user_id = $2
           AND scan_state = 'clean' AND retention_state = 'active' FOR SHARE`,
        [input.evidenceFileId, principal.userId],
      );
      if (!file.rowCount) throw new AccessError(404, 'Private evidence file not found');

      const id = randomUUID();
      await client.query(
        `INSERT INTO garage_review (
           id, author_user_id, garage_id, service_category_id, vehicle_make_id, visit_month,
           work_quality, communication, price_transparency, punctuality, review_text,
           publication_state
         ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, 'submitted')`,
        [
          id,
          principal.userId,
          input.garageId,
          input.serviceCategoryId,
          input.vehicleMakeId ?? null,
          `${input.visitMonth}-01`,
          input.workQuality,
          input.communication,
          input.priceTransparency,
          input.punctuality,
          input.text.trim(),
        ],
      );
      try {
        await client.query(
          `INSERT INTO visit_evidence (
             id, review_id, owner_user_id, private_file_id, evidence_kind, verification_state
           ) VALUES ($1, $2, $3, $4, $5, 'submitted')`,
          [randomUUID(), id, principal.userId, input.evidenceFileId, input.evidenceKind],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AccessError(409, 'A private evidence file can only support one review');
        }
        throw error;
      }
      await this.audit(client, principal.userId, id, 'review-submitted');
      await client.query('COMMIT');
      return toOwnReview({
        author_user_id: principal.userId,
        communication: input.communication,
        evidence_status: 'submitted',
        id,
        price_transparency: input.priceTransparency,
        publication_state: 'submitted',
        punctuality: input.punctuality,
        rejection_reason_code: null,
        service_category_id: input.serviceCategoryId,
        visit_month: input.visitMonth,
        garage_id: input.garageId,
        work_quality: input.workQuality,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async decideReview(
    principal: Principal,
    reviewId: string,
    decision: ReviewDecisionInput,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      await this.ensureUser(client, principal.userId);
      // CASE-4: the version check and the evidence/publication mutation share this row lock.
      const cases = await client.query<{
        revision: number;
        status: string;
        appeal_against_user_id: string | null;
        assigned_moderator_user_id: string | null;
        escalation_reason: string | null;
      }>(
        `SELECT revision,status,appeal_against_user_id,assigned_moderator_user_id,escalation_reason
         FROM moderation_case WHERE id=$1 AND kind='review_submission' FOR UPDATE`,
        [`review:${reviewId}`],
      );
      const record = cases.rows[0];
      assertCaseRevision(record?.revision, decision.caseRevision);
      const review = await this.getReviewAccess(client, reviewId, true);
      this.requireModerationAccess(principal, review);
      await this.requireNoReviewInterest(client, review, principal.userId);
      if (
        record &&
        !principal.roles.has('admin') &&
        (record.assigned_moderator_user_id !== principal.userId || record.escalation_reason)
      )
        throw new AccessError(403, 'Moderator access denied for this case');
      const open =
        record && ['submitted', 'assigned', 'waiting_for_subject'].includes(record.status);
      const reconsideration =
        open &&
        record.appeal_against_user_id !== null &&
        ['published', 'rejected'].includes(review.publication_state);
      if ((record && !open) || (review.publication_state !== 'under_review' && !reconsideration))
        throw new AccessError(
          409,
          'Only an open review or independent appeal can receive a decision',
        );
      this.validateDecision(decision);
      if (decision.decision === 'published') {
        if (
          review.retention_state !== 'active' ||
          review.scan_state !== 'clean' ||
          !decision.checklist.serviceMatches ||
          !decision.checklist.visitMonthMatches ||
          !decision.checklist.garageMatches
        ) {
          throw new AccessError(
            422,
            'A review needs a checked private visit evidence before publication',
          );
        }
        await client.query(
          `UPDATE garage_review
           SET publication_state = 'published', published_at = COALESCE(published_at,now()),
               rejection_reason_code = NULL
           WHERE id = $1`,
          [reviewId],
        );
        await client.query(
          `UPDATE visit_evidence
           SET verification_state = 'verified', service_matches = true, visit_month_matches = true,
               garage_matches = true, reviewed_by_user_id = $2, reviewed_at = now()
           WHERE review_id = $1`,
          [reviewId, principal.userId],
        );
      } else {
        await client.query(
          `UPDATE garage_review
           SET publication_state = 'rejected', rejection_reason_code = $2, published_at = NULL
           WHERE id = $1`,
          [reviewId, decision.rejectionReason],
        );
        await client.query(
          `UPDATE visit_evidence
           SET verification_state = 'not_verified', service_matches = $2, visit_month_matches = $3,
               garage_matches = $4, reviewed_by_user_id = $5, reviewed_at = now()
           WHERE review_id = $1`,
          [
            reviewId,
            decision.checklist.serviceMatches,
            decision.checklist.visitMonthMatches,
            decision.checklist.garageMatches,
            principal.userId,
          ],
        );
      }
      // An upheld appeal may leave the review's publication state unchanged. Close the case
      // explicitly rather than relying on a publication-state trigger to detect a transition.
      await client.query(
        `UPDATE moderation_case SET decided_by_user_id=$2,status=$3,reason_code=$4,
          appeal_against_user_id=NULL WHERE id=$1`,
        [
          `review:${reviewId}`,
          principal.userId,
          decision.decision === 'published' ? 'resolved' : 'rejected',
          decision.decision === 'published' ? 'no_violation' : 'policy_violation',
        ],
      );
      await this.audit(client, principal.userId, reviewId, `review-${decision.decision}`);
      await this.audit(
        client,
        principal.userId,
        reviewId,
        `review-decision-reason-${decision.decision === 'published' ? 'no_violation' : decision.rejectionReason}`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteEvidenceAfterRetention(admin: Principal, reviewId: string): Promise<string> {
    this.requireAdmin(admin);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, admin);
      await this.ensureUser(client, admin.userId);
      await client.query('SELECT id FROM moderation_case WHERE id=$1 FOR UPDATE', [
        `review:${reviewId}`,
      ]);
      const review = await this.getReviewAccess(client, reviewId, true);
      if (review.publication_state !== 'published' || review.evidence_status !== 'verified') {
        throw new AccessError(409, 'Only verified evidence of a published review can be deleted');
      }
      await client.query(
        `UPDATE file_object SET retention_state = 'deleted_after_retention' WHERE id = $1`,
        [review.evidence_file_id],
      );
      await client.query(
        `UPDATE visit_evidence
         SET verification_state = 'deleted_after_retention', deleted_at = now()
         WHERE review_id = $1`,
        [reviewId],
      );
      await this.audit(client, admin.userId, reviewId, 'review-evidence-deleted-after-retention');
      await client.query('COMMIT');
      return review.evidence_file_id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async issueEvidenceDownloadGrant(principal: Principal, reviewId: string): Promise<FileGrant> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      const review = await this.getReviewAccess(client, reviewId);
      // REVIEW-1: use the existing current case predicate for both submitted reviews and
      // assigned reports about that review. The role alone never grants file access.
      const assignment = principal.roles.has('moderator')
        ? await client.query<{ allowed: boolean }>(
            "SELECT staff_assigned_subject('review',$1) AS allowed",
            [reviewId],
          )
        : undefined;
      const isAssignedModerator = assignment?.rows[0]?.allowed === true;
      if (
        review.author_user_id !== principal.userId &&
        !principal.roles.has('admin') &&
        !isAssignedModerator
      ) {
        throw new AccessError(404, 'Private visit evidence not found');
      }
      if (review.retention_state !== 'active' || review.scan_state !== 'clean') {
        throw new AccessError(404, 'Private visit evidence not found');
      }
      await client.query('COMMIT');
      return {
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        fileId: review.evidence_file_id,
        grantId: randomUUID(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listOwnReviewPage(
    principal: Principal,
    filter: OwnReviewListFilter | number = {},
  ): Promise<OwnReviewPage> {
    const normalized = typeof filter === 'number' ? { page: filter } : filter;
    const page = normalized.page ?? 1;
    validatePage(page);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      const rows = await this.ownDetails(
        client,
        principal,
        undefined,
        REVIEW_PAGE_SIZE + 1,
        (page - 1) * REVIEW_PAGE_SIZE,
        normalized,
      );
      const total = await this.ownReviewCount(client, principal, normalized);
      await client.query('COMMIT');
      return {
        reviews: rows.slice(0, REVIEW_PAGE_SIZE),
        page,
        hasMore: rows.length > REVIEW_PAGE_SIZE,
        total,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async getOwnReview(principal: Principal, reviewId: string): Promise<OwnReviewDetail> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      const rows = await this.ownDetails(client, principal, reviewId, 1, 0);
      if (!rows[0]) throw new AccessError(404, 'Own review not found');
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async ownDetails(
    client: pg.PoolClient,
    principal: Principal,
    reviewId: string | undefined,
    limit: number,
    offset: number,
    filter: OwnReviewListFilter = {},
  ): Promise<OwnReviewDetail[]> {
    const query = filter.query?.trim() || null;
    const state = filter.publicationState ?? null;
    const order = filter.sort === 'submitted_asc' ? 'ASC' : 'DESC';
    const result = await client.query<
      ReviewRow & {
        review_text: string;
        garage_name: string | null;
        evidence_kind: OwnReviewDetail['evidenceKind'];
        evidence_file_id: string | null;
        vehicle_make_id: string | null;
        submitted_at: Date;
        case_status: string | null;
        case_reason: string | null;
      }
    >(
      `SELECT r.*,to_char(r.visit_month,'YYYY-MM') AS visit_month,g.name AS garage_name,
       e.verification_state AS evidence_status,e.evidence_kind,e.private_file_id AS evidence_file_id,
       c.status AS case_status,c.reason_code AS case_reason
       FROM garage_review r LEFT JOIN visit_evidence e ON e.review_id=r.id
       LEFT JOIN public_garage_profile g ON g.id=r.garage_id
       LEFT JOIN moderation_case c ON c.id='review:'||r.id AND c.kind='review_submission'
       WHERE r.author_user_id=$1 AND ($2::text IS NULL OR r.id=$2)
         AND ($3::text IS NULL OR r.publication_state=$3)
         AND ($4::text IS NULL OR concat_ws(' ',g.name,r.service_category_id,r.review_text) ILIKE '%' || $4 || '%')
       ORDER BY r.submitted_at ${order},r.id ${order} LIMIT $5 OFFSET $6`,
      [principal.userId, reviewId ?? null, state, query, limit, offset],
    );
    const updates = result.rows.length
      ? await client.query<{
          review_id: string;
          update_kind: ReviewUpdateKind;
          update_text: string;
          created_at: Date;
        }>(
          `SELECT review_id,update_kind,update_text,created_at FROM review_update WHERE author_user_id=$1 AND review_id=ANY($2::text[]) ORDER BY created_at,id LIMIT 500`,
          [principal.userId, result.rows.map((r) => r.id)],
        )
      : { rows: [] };
    return result.rows.map((row) => ({
      ...toOwnReview(row),
      text: row.review_text,
      garageName: row.garage_name ?? '',
      evidenceKind: row.evidence_kind,
      submittedAt: row.submitted_at.toISOString(),
      ...(row.evidence_file_id ? { evidenceFileId: row.evidence_file_id } : {}),
      ...(row.vehicle_make_id ? { vehicleMakeId: row.vehicle_make_id } : {}),
      ...(row.case_status ? { caseStatus: row.case_status } : {}),
      ...(row.case_reason ? { caseReason: row.case_reason } : {}),
      updates: updates.rows
        .filter((u) => u.review_id === row.id)
        .map((u) => ({
          kind: u.update_kind,
          text: u.update_text,
          createdAt: u.created_at.toISOString(),
        })),
    }));
  }
  private async ownReviewCount(
    client: pg.PoolClient,
    principal: Principal,
    filter: OwnReviewListFilter,
  ): Promise<number> {
    const query = filter.query?.trim() || null;
    const state = filter.publicationState ?? null;
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM garage_review r LEFT JOIN public_garage_profile g ON g.id=r.garage_id
       WHERE r.author_user_id=$1
         AND ($2::text IS NULL OR r.publication_state=$2)
         AND ($3::text IS NULL OR concat_ws(' ',g.name,r.service_category_id,r.review_text) ILIKE '%' || $3 || '%')`,
      [principal.userId, state, query],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
  async listPublicReviewPage(
    garageId: string,
    filter: ReviewPublicFilter = {},
  ): Promise<PublicReviewPage> {
    const page = filter.page ?? 1;
    validatePage(page);
    const reviews = await this.listPublicReviews(garageId, { ...filter, page });
    return {
      reviews: reviews.slice(0, REVIEW_PAGE_SIZE),
      page,
      hasMore: reviews.length > REVIEW_PAGE_SIZE,
    };
  }
  async listOwnReviews(principal: Principal): Promise<readonly OwnReview[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      const result = await client.query<ReviewRow>(
        `SELECT review.id, review.author_user_id, review.garage_id, review.service_category_id,
                to_char(review.visit_month, 'YYYY-MM') AS visit_month, review.work_quality,
                review.communication, review.price_transparency, review.punctuality,
                review.publication_state, review.rejection_reason_code,
                evidence.verification_state AS evidence_status
         FROM garage_review AS review
         JOIN visit_evidence AS evidence ON evidence.review_id = review.id
         WHERE review.author_user_id = $1
         ORDER BY review.submitted_at DESC`,
        [principal.userId],
      );
      await client.query('COMMIT');
      return result.rows.map(toOwnReview);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listPublicReviews(
    garageId: string,
    filter: ReviewPublicFilter = {},
  ): Promise<readonly PublicGarageReview[]> {
    const result = await this.pool.query<PublicReviewRow>(
      `SELECT id, service_category_id, vehicle_make_id, to_char(visit_month, 'YYYY-MM') AS visit_month,
              work_quality, communication, price_transparency, punctuality, overall_rating,
              review_text, published_at
       FROM public_garage_review
       WHERE garage_id = $1 AND EXISTS(SELECT 1 FROM public_garage_profile WHERE id=$1)
         AND ($2::text IS NULL OR service_category_id = $2)
         AND ($3::text IS NULL OR vehicle_make_id = $3)
       ORDER BY visit_month DESC, published_at DESC, id LIMIT $4 OFFSET $5`,
      [
        garageId,
        filter.serviceCategoryId ?? null,
        filter.vehicleMakeId ?? null,
        REVIEW_PAGE_SIZE + 1,
        ((filter.page ?? 1) - 1) * REVIEW_PAGE_SIZE,
      ],
    );
    return Promise.all(result.rows.map((review) => this.toPublicReview(review)));
  }

  async postReviewUpdate(
    principal: Principal,
    reviewId: string,
    kind: ReviewUpdateKind,
    text: string,
    requestId?: string,
  ): Promise<void> {
    if (!isReviewUpdateKind(kind)) throw new AccessError(422, 'Review update is invalid');
    validateReviewText(text, REVIEW_LIMITS.maxUpdateLength);
    validateRequestId(requestId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      const review = await this.getReviewAccess(client, reviewId);
      if (review.author_user_id !== principal.userId)
        throw new AccessError(404, 'Review not found');
      if (review.publication_state !== 'published') {
        throw new AccessError(409, 'Only published reviews can receive an update');
      }
      await this.lockContribution(client, reviewId);
      const currentAuthor = await client.query(
        'SELECT 1 FROM garage_review WHERE id=$1 AND author_user_id=$2',
        [reviewId, principal.userId],
      );
      if (!currentAuthor.rowCount) throw new AccessError(404, 'Own review not found');
      if (requestId) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          JSON.stringify([principal.userId, requestId]),
        ]);
        const prior = await client.query<{
          review_id: string;
          update_kind: string;
          update_text: string;
        }>(
          'SELECT review_id,update_kind,update_text FROM review_update WHERE author_user_id=$1 AND request_id=$2',
          [principal.userId, requestId],
        );
        if (prior.rows[0]) {
          if (
            prior.rows[0].review_id !== reviewId ||
            prior.rows[0].update_kind !== kind ||
            prior.rows[0].update_text !== text.trim()
          )
            throw new AccessError(409, 'Update request already used');
          await client.query('COMMIT');
          return;
        }
      }
      await client.query(
        `INSERT INTO review_update (id, review_id, author_user_id, update_kind, update_text, request_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), reviewId, principal.userId, kind, text.trim(), requestId ?? null],
      );
      await this.audit(client, principal.userId, reviewId, `review-${kind}-added`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async postGarageResponse(
    principal: Principal,
    garageId: string,
    reviewId: string,
    text: string,
    requestId?: string,
    responseRevision?: number,
  ): Promise<void> {
    validateReviewText(text, REVIEW_LIMITS.maxResponseLength);
    validateRequestId(requestId);
    if (
      responseRevision !== undefined &&
      (!Number.isSafeInteger(responseRevision) || responseRevision < 0)
    )
      throw new AccessError(422, 'Invalid response revision');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, principal);
      const review = await client.query<{ garage_id: string }>(
        'SELECT garage_id FROM public_garage_review WHERE id = $1',
        [reviewId],
      );
      if (review.rows[0]?.garage_id !== garageId) {
        throw new AccessError(404, 'Published review not found');
      }
      {
        const member = await client.query(
          `SELECT 1 FROM membership
           WHERE garage_id = $1 AND user_id = $2 AND state = 'active'`,
          [garageId, principal.userId],
        );
        if (!member.rowCount) throw new AccessError(403, 'Garage access denied');
      }
      await this.lockContribution(client, reviewId);
      const currentMember = await client.query(
        "SELECT 1 FROM membership WHERE garage_id=$1 AND user_id=$2 AND state='active' FOR SHARE",
        [garageId, principal.userId],
      );
      if (!currentMember.rowCount) throw new AccessError(403, 'Garage access denied');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        'response:' + reviewId,
      ]);
      const prior = await client.query<{
        revision: number;
        request_id: string | null;
        response_text: string;
      }>(
        'SELECT revision,request_id,response_text FROM review_garage_response WHERE review_id=$1 FOR UPDATE',
        [reviewId],
      );
      if (requestId && prior.rows[0]?.request_id === requestId) {
        if (prior.rows[0].response_text !== text.trim())
          throw new AccessError(409, 'Response request already used');
        await client.query('COMMIT');
        return;
      }
      if (responseRevision !== undefined && (prior.rows[0]?.revision ?? 0) !== responseRevision)
        throw new AccessError(409, 'The garage response changed; reload before editing');
      await client.query(
        `INSERT INTO review_garage_response (
           review_id, garage_id, author_user_id, response_text, request_id
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (review_id) DO UPDATE
         SET response_text = EXCLUDED.response_text, author_user_id = EXCLUDED.author_user_id,
             request_id=EXCLUDED.request_id,revision=review_garage_response.revision+1,updated_at = now()`,
        [reviewId, garageId, principal.userId, text.trim(), requestId ?? null],
      );
      await this.audit(client, principal.userId, reviewId, 'review-garage-response-posted');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async registerPrivateFile(
    ownerUserId: string,
    fileId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.ensureUser(client, ownerUserId);
      // A grant is not proof of an uploaded file. The storage scanner must move this from pending
      // to clean before a review can reference it.
      await client.query(
        `INSERT INTO file_object (
           id, owner_user_id, storage_key, content_type, size_bytes, scan_state, retention_state
         ) VALUES ($1, $2, $3, $4, $5, 'pending', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [fileId, ownerUserId, `quarantine/${fileId}`, contentType, sizeBytes],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockContribution(client: pg.PoolClient, reviewId: string): Promise<void> {
    const locked = await client.query<{ allowed: boolean }>(
      'SELECT review_lock_contribution($1) AS allowed',
      [reviewId],
    );
    if (!locked.rows[0]?.allowed)
      throw new AccessError(409, 'This review no longer accepts public contributions');
  }
  private async audit(
    client: pg.PoolClient,
    actorUserId: string,
    subjectId: string,
    eventType: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO moderation_event (id, actor_user_id, subject_type, subject_id, event_type)
       VALUES ($1, $2, 'review', $3, $4)`,
      [randomUUID(), actorUserId, subjectId, eventType],
    );
  }

  private async ensureUser(client: pg.PoolClient, userId: string): Promise<void> {
    await client.query(
      `INSERT INTO app_user (id, oidc_subject, status)
       VALUES ($1, $1, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [userId],
    );
  }

  private async getReviewAccess(
    client: pg.PoolClient,
    reviewId: string,
    lock = false,
  ): Promise<ReviewAccessRow> {
    const result = await client.query<ReviewAccessRow>(
      `SELECT review.id, review.author_user_id, review.garage_id, review.service_category_id,
              to_char(review.visit_month, 'YYYY-MM') AS visit_month, review.work_quality,
              review.communication, review.price_transparency, review.punctuality,
              review.publication_state, review.rejection_reason_code,
              evidence.private_file_id AS evidence_file_id,
              evidence.verification_state AS evidence_status,
              file.retention_state, file.scan_state,
              (SELECT appeal_against_user_id FROM moderation_case WHERE id='review:'||review.id) AS appeal_against_user_id,
              assignment.moderator_user_id
       FROM garage_review AS review
       JOIN visit_evidence AS evidence ON evidence.review_id = review.id
       JOIN file_object AS file ON file.id = evidence.private_file_id
       LEFT JOIN review_moderator_assignment AS assignment ON assignment.review_id = review.id
       WHERE review.id = $1${lock ? ' FOR UPDATE OF review, evidence, file' : ''}`,
      [reviewId],
    );
    const review = result.rows[0];
    if (!review) throw new AccessError(404, 'Review not found');
    return review;
  }

  private requireAdmin(principal: Principal): void {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
  }

  private async requireNoReviewInterest(
    client: pg.PoolClient,
    review: ReviewAccessRow,
    userId: string,
  ): Promise<void> {
    if (review.author_user_id === userId || review.appeal_against_user_id === userId)
      throw new AccessError(403, 'A person involved in this review cannot decide it');
    const member = await client.query(
      "SELECT 1 FROM membership WHERE garage_id=$1 AND user_id=$2 AND state='active' FOR SHARE",
      [review.garage_id, userId],
    );
    if (member.rowCount) throw new AccessError(403, 'A garage member cannot moderate its reviews');
  }

  private requireModerationAccess(principal: Principal, review: ReviewAccessRow): void {
    if (review.author_user_id === principal.userId) {
      throw new AccessError(403, 'A reviewer cannot decide their own review');
    }
    if (principal.roles.has('admin')) return;
    if (principal.roles.has('moderator') && review.moderator_user_id === principal.userId) return;
    throw new AccessError(403, 'Moderator access denied for this review');
  }

  private async setPrincipal(client: pg.PoolClient, principal: Principal): Promise<void> {
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [principal.userId]);
    const systemRole = principal.roles.has('admin')
      ? 'admin'
      : principal.roles.has('moderator')
        ? 'moderator'
        : '';
    await client.query(`SELECT set_config('app.system_role', $1, true)`, [systemRole]);
    await assertCurrentStaffIdentity(client, principal);
    await this.ensureUser(client, principal.userId);
    const user = await client.query(
      "SELECT id FROM app_user WHERE id=$1 AND status='active' FOR SHARE",
      [principal.userId],
    );
    if (!user.rowCount) throw new AccessError(403, 'Active account required');
  }

  private async toPublicReview(review: PublicReviewRow): Promise<PublicGarageReview> {
    const [response, updates] = await Promise.all([
      this.pool.query<PublicResponseRow>(
        `SELECT created_at, updated_at, revision, response_text FROM public_review_garage_response WHERE review_id = $1`,
        [review.id],
      ),
      this.pool.query<PublicUpdateRow>(
        `SELECT created_at, update_kind, update_text
         FROM public_review_update WHERE review_id = $1 ORDER BY created_at, id`,
        [review.id],
      ),
    ]);
    return {
      evidence: { label: 'Besuch belegt', state: 'verified' },
      id: review.id,
      ratings: {
        communication: review.communication,
        overall: Number(review.overall_rating),
        priceTransparency: review.price_transparency,
        punctuality: review.punctuality,
        workQuality: review.work_quality,
      },
      serviceCategoryId: review.service_category_id,
      text: review.review_text,
      updates: updates.rows.map((update) => ({
        createdAt: update.created_at.toISOString(),
        kind: update.update_kind,
        text: update.update_text,
      })),
      ...(review.vehicle_make_id ? { vehicleMakeId: review.vehicle_make_id } : {}),
      visitMonth: review.visit_month,
      ...(response.rows[0]
        ? {
            garageResponse: {
              createdAt: response.rows[0].created_at.toISOString(),
              updatedAt: response.rows[0].updated_at.toISOString(),
              revision: response.rows[0].revision,
              text: response.rows[0].response_text,
            },
          }
        : {}),
    };
  }

  private validateDecision(decision: ReviewDecisionInput): void {
    if (decision.decision !== 'published' && decision.decision !== 'rejected') {
      throw new AccessError(422, 'Review decision is invalid');
    }
    if (
      !decision.checklist ||
      typeof decision.checklist.serviceMatches !== 'boolean' ||
      typeof decision.checklist.visitMonthMatches !== 'boolean' ||
      typeof decision.checklist.garageMatches !== 'boolean'
    ) {
      throw new AccessError(422, 'Evidence checklist is invalid');
    }
    if (decision.decision === 'rejected' && !isReviewRejectionReason(decision.rejectionReason)) {
      throw new AccessError(422, 'A rejected review needs a reason for the author');
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
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

function validatePage(page: number): void {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw new AccessError(400, 'Invalid review page');
}
function validateRequestId(id: string | undefined): void {
  if (id !== undefined && !/^[a-f0-9-]{36}$/i.test(id))
    throw new AccessError(422, 'Invalid request identifier');
}
function validateReviewText(text: string, maximum: number): void {
  if (
    typeof text !== 'string' ||
    text.trim().length < REVIEW_LIMITS.minTextLength ||
    text.trim().length > maximum
  )
    throw new AccessError(422, 'Invalid review text');
}
