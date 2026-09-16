import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccessError, type Principal } from './access';
import { assertCurrentStaffIdentity } from './staff-identity';
import { PostgresGarageOnboardingStore } from './garage-onboarding-store';
import { localDemoPhotoPath } from '../shared/local-demo';
import {
  validGarageProfile,
  type GarageProfileInput,
  type VerificationChecklist,
} from '../shared/garage-onboarding';
import {
  ADMIN_PAGE_SIZE,
  validAdminRevision,
  validAdminDecision,
  type AdminPage,
  type AdminUser,
  type AdminOverview,
  type AdminGarageSummary,
  type AdminGarageDetail,
  type AdminMember,
  type AdminRevision,
  type AdminGarageDecision,
  type AdminPrivacy,
  type AdminPrivacyRequest,
  type AdminAuditEvent,
  type AdminCatalog,
  type AdminCatalogItem,
  type AdminGaragePublishBlocker,
} from '../shared/administration';

export interface AdminFilter {
  readonly page?: number;
  readonly query?: string;
  readonly status?: string;
  readonly requestId?: string;
}
interface PrivacyRow {
  readonly id: string;
  readonly user_id: string;
  readonly policy_version: string | null;
  readonly status: AdminPrivacyRequest['status'];
  readonly created_at: Date;
  readonly label: string;
  readonly ownerships: number;
  readonly owned_garages: readonly { readonly id: string; readonly name: string }[];
  readonly pending_files: number;
  readonly file_objects: number;
  readonly garage_reviews: number;
  readonly content_reports: number;
  readonly runnable: boolean;
  readonly bound_version: string | null;
  readonly bound_approval_reference: string | null;
  readonly bound_review_handling: 'delete' | 'retain_anonymized' | null;
  readonly bound_review_days: number | null;
  readonly bound_request_days: number | null;
  readonly bound_report_days: number | null;
  readonly bound_audit_days: number | null;
  readonly bound_configured_at: Date | null;
}

/** Administrative views reuse existing tables and the verified role check. No role editor. */
export class PostgresAdministrationStore extends PostgresGarageOnboardingStore {
  async validateAdmin(principal: Principal): Promise<void> {
    await this.adminTransaction(principal, async () => undefined);
  }
  async overview(principal: Principal): Promise<AdminOverview> {
    return this.adminTransaction(principal, async (client) => {
      const result = await client.query<AdminOverview>(`${this.privacyReadinessCte()} SELECT
        (SELECT count(*)::integer FROM garage WHERE publication_state='pending_review' AND deleted_at IS NULL) AS "pendingGarages",
        (SELECT count(*)::integer FROM moderation_case WHERE kind IN ('report','review_submission') AND assigned_moderator_user_id IS NULL AND status IN ('submitted','assigned') AND escalation_reason IS NULL) AS "unassignedCases",
        (SELECT count(*)::integer FROM moderation_case WHERE escalation_reason IS NOT NULL AND status IN ('submitted','assigned')) AS "escalatedCases",
        (SELECT count(*)::integer FROM privacy_readiness WHERE runnable) AS "pendingDeletions",
        (SELECT count(*)::integer FROM privacy_readiness WHERE status<>'completed' AND NOT runnable) AS "blockedDeletions"`);
      return result.rows[0];
    });
  }
  async users(principal: Principal, filter: AdminFilter): Promise<AdminPage<AdminUser>> {
    const page = checkedPage(filter.page),
      query = checkedQuery(filter.query);
    return this.adminTransaction(principal, async (client) => {
      const users = await client.query<{
        id: string;
        label: string;
        account_type: 'customer' | 'garage';
        status: 'active' | 'suspended';
        verified_roles: string[] | null;
        verified_at: Date | null;
      }>(
        `SELECT u.id,COALESCE(s.display_name,u.id) AS label,u.account_type,u.status,s.verified_roles,s.verified_at
         FROM app_user u LEFT JOIN staff_identity s ON s.user_id=u.id
         WHERE ($1='' OR u.id ILIKE $2 OR s.display_name ILIKE $2)
         ORDER BY COALESCE(s.display_name,u.id),u.id LIMIT $3 OFFSET $4`,
        [query, '%' + escapeLike(query) + '%', ADMIN_PAGE_SIZE + 1, (page - 1) * ADMIN_PAGE_SIZE],
      );
      const items: AdminUser[] = [];
      for (const u of users.rows.slice(0, ADMIN_PAGE_SIZE)) {
        const memberships = await client.query<
          AdminMember & { garageId: string; garageName: string }
        >(
          `SELECT m.user_id AS "userId",COALESCE(s.display_name,m.user_id) AS label,m.role,m.state,
           m.garage_id AS "garageId",g.name AS "garageName" FROM membership m JOIN garage g ON g.id=m.garage_id
           LEFT JOIN staff_identity s ON s.user_id=m.user_id WHERE m.user_id=$1 ORDER BY g.name,g.id LIMIT 50`,
          [u.id],
        );
        items.push({
          id: u.id,
          label: u.label,
          accountType: u.account_type,
          status: u.status,
          roles: ['customer', ...(u.verified_roles ?? [])],
          ...(u.verified_at ? { rolesVerifiedAt: u.verified_at.toISOString() } : {}),
          memberships: memberships.rows,
        });
      }
      return { items, page, hasMore: users.rows.length > ADMIN_PAGE_SIZE };
    });
  }
  async garages(principal: Principal, filter: AdminFilter): Promise<AdminPage<AdminGarageSummary>> {
    const page = checkedPage(filter.page),
      query = checkedQuery(filter.query);
    if (
      filter.status &&
      !['draft', 'pending_review', 'published', 'rejected', 'suspended', 'deleted'].includes(
        filter.status,
      )
    )
      throw new AccessError(400, 'Invalid garage status');
    return this.adminTransaction(principal, async (client) => {
      const result = await client.query<AdminGarageSummary>(
        `SELECT g.id,g.name,g.publication_state AS "publicationState",g.admin_revision AS revision,
         g.deleted_at IS NOT NULL AS deleted,
         (SELECT count(*)::integer FROM membership m WHERE m.garage_id=g.id AND m.role='owner' AND m.state='active') AS "ownerCount"
         FROM garage g WHERE ($1='' OR g.name ILIKE $2 OR g.id ILIKE $2)
         AND ($3::text IS NULL OR ($3='deleted' AND g.deleted_at IS NOT NULL) OR ($3=g.publication_state AND g.deleted_at IS NULL))
         ORDER BY (g.publication_state='pending_review') DESC,g.name,g.id LIMIT $4 OFFSET $5`,
        [
          query,
          '%' + escapeLike(query) + '%',
          filter.status || null,
          ADMIN_PAGE_SIZE + 1,
          (page - 1) * ADMIN_PAGE_SIZE,
        ],
      );
      return {
        items: result.rows.slice(0, ADMIN_PAGE_SIZE),
        page,
        hasMore: result.rows.length > ADMIN_PAGE_SIZE,
      };
    });
  }
  async garage(principal: Principal, id: string): Promise<AdminGarageDetail> {
    return this.adminTransaction(principal, async (client) => {
      const aggregate = await client.query<{
        admin_revision: number;
        admin_suspended: boolean;
        admin_last_reason: AdminGarageDetail['lastReason'] | null;
        deleted_at: Date | null;
        moderation_hidden_case_id: string | null;
      }>(
        'SELECT admin_revision,admin_suspended,admin_last_reason,deleted_at,moderation_hidden_case_id FROM garage WHERE id=$1 FOR SHARE',
        [id],
      );
      if (!aggregate.rows[0]) throw new AccessError(404, 'Garage not found');
      const base = await this.read(client, id),
        row = aggregate.rows[0];
      const members = await this.members(client, id);
      const documents = await client.query<{ fileId: string; available: boolean }>(
        `SELECT d.file_id AS "fileId",f.scan_state='clean' AND f.retention_state='active' AS available
         FROM garage_verification_document d JOIN file_object f ON f.id=d.file_id WHERE d.garage_id=$1 ORDER BY d.created_at,d.file_id LIMIT 20`,
        [id],
      );
      const photos = await client.query<{
        id: string;
        visibility: AdminGarageDetail['photos'][number]['visibility'];
        fixture_key: string | null;
      }>(
        `SELECT p.id,p.visibility,f.fixture_key FROM garage_photo p LEFT JOIN local_demo_admin_photo f ON f.photo_id=p.id
         WHERE p.garage_id=$1 ORDER BY p.created_at,p.id LIMIT 30`,
        [id],
      );
      const consent = await client.query<{ source: string }>(
        'SELECT source FROM garage_consent WHERE garage_id=$1',
        [id],
      );
      const activeOwner = await client.query(
        `SELECT 1 FROM membership m JOIN app_user u ON u.id=m.user_id
         WHERE m.garage_id=$1 AND m.role='owner' AND m.state='active' AND u.status='active'
         FOR SHARE OF m,u`,
        [id],
      );
      const availableProof = documents.rows.some((document) => document.available);
      const ownInterest = members.some(
        (member) => member.userId === principal.userId && member.state === 'active',
      );
      const blockers: AdminGaragePublishBlocker[] = [];
      if (base.publicationState !== 'pending_review') blockers.push('state');
      if (row.moderation_hidden_case_id) blockers.push('moderation_hidden');
      if (!validGarageProfile(base.profile, base.profile)) blockers.push('profile');
      if (!base.profile.locationPoint) blockers.push('point');
      if (!availableProof) blockers.push('company_document');
      if (!activeOwner.rowCount) blockers.push('owner_account');
      if (ownInterest) blockers.push('interest');
      return {
        id: base.id,
        name: base.profile.name,
        publicationState: base.publicationState,
        profile: base.profile,
        verification: base.verification,
        revision: row.admin_revision,
        deleted: !!row.deleted_at,
        adminSuspended: row.admin_suspended,
        ...(row.admin_last_reason ? { lastReason: row.admin_last_reason } : {}),
        ownerCount: members.filter((m) => m.role === 'owner' && m.state === 'active').length,
        ...(base.consentVersion ? { consentVersion: base.consentVersion } : {}),
        ...(consent.rows[0] ? { consentSource: consent.rows[0].source } : {}),
        members,
        documents: documents.rows,
        photos: photos.rows.map((p) => ({
          id: p.id,
          visibility: p.visibility,
          ...(p.fixture_key && localDemoPhotoPath('demo-admin-fixture', p.fixture_key)
            ? { previewPath: localDemoPhotoPath('demo-admin-fixture', p.fixture_key)! }
            : {}),
        })),
        prerequisites: { publishable: blockers.length === 0, blockers },
      };
    });
  }
  async publicPhoto(garageId: string, photoId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ fixture_key: string }>(
      'SELECT fixture_key FROM public_demo_admin_photo WHERE garage_id=$1 AND photo_id=$2',
      [garageId, photoId],
    );
    return result.rows[0]
      ? (localDemoPhotoPath('demo-admin-fixture', result.rows[0].fixture_key) ?? undefined)
      : undefined;
  }
  async privacy(principal: Principal, filter: AdminFilter): Promise<AdminPrivacy> {
    const page = checkedPage(filter.page);
    if (filter.status && !['submitted', 'blocked', 'completed'].includes(filter.status))
      throw new AccessError(400, 'Invalid deletion request status');
    const requestId = checkedPrivacyRequestId(filter.requestId);
    return this.adminTransaction(principal, async (client) => {
      const policies = await client.query(
        'SELECT * FROM lifecycle_policy ORDER BY configured_at DESC,version DESC LIMIT 1',
      );
      const p = policies.rows[0];
      const requests = await this.privacyRows(
        client,
        filter.status,
        ADMIN_PAGE_SIZE + 1,
        (page - 1) * ADMIN_PAGE_SIZE,
      );
      const selected = requestId
        ? (await this.privacyRows(client, undefined, 1, 0, requestId)).rows[0]
        : undefined;
      return {
        page,
        hasMore: requests.rows.length > ADMIN_PAGE_SIZE,
        requests: requests.rows.slice(0, ADMIN_PAGE_SIZE).map((row) => this.privacyRequest(row)),
        ...(selected ? { selected: this.privacyRequest(selected) } : {}),
        ...(p ? { policy: this.policyProjection(p) } : {}),
      };
    });
  }
  /** One read-only readiness definition powers both overview counts and bounded request views. */
  private privacyReadinessCte(): string {
    return `WITH privacy_readiness AS (
      SELECT d.id,d.user_id,d.policy_version,d.status,d.created_at,
       EXISTS(SELECT 1 FROM lifecycle_policy lp WHERE lp.version=d.policy_version) AS has_bound_policy,
       EXISTS(SELECT 1 FROM membership m WHERE m.user_id=d.user_id AND m.role='owner' AND m.state='active') AS has_active_ownership,
       (d.status='submitted' AND EXISTS(SELECT 1 FROM lifecycle_policy lp WHERE lp.version=d.policy_version)
        AND NOT EXISTS(SELECT 1 FROM membership m WHERE m.user_id=d.user_id AND m.role='owner' AND m.state='active')) AS runnable
      FROM data_deletion_request d
    )`;
  }
  private async privacyRows(
    client: pg.PoolClient,
    status: string | undefined,
    limit: number,
    offset: number,
    requestId?: string,
  ) {
    return client.query<PrivacyRow>(
      `${this.privacyReadinessCte()}
      SELECT r.*,COALESCE(s.display_name,r.user_id) AS label,
       (SELECT count(*)::integer FROM membership m WHERE m.user_id=r.user_id AND m.role='owner' AND m.state='active') AS ownerships,
       COALESCE((SELECT json_agg(garage_row ORDER BY garage_row.name,garage_row.id) FROM (
          SELECT g.id,g.name FROM membership m JOIN garage g ON g.id=m.garage_id
          WHERE m.user_id=r.user_id AND m.role='owner' AND m.state='active' ORDER BY g.name,g.id LIMIT 20
       ) garage_row),'[]'::json) AS owned_garages,
       (SELECT count(*)::integer FROM object_deletion_task t JOIN file_object f ON f.id=t.file_id WHERE f.owner_user_id=r.user_id AND t.completed_at IS NULL) AS pending_files,
       (SELECT count(*)::integer FROM file_object f WHERE f.owner_user_id=r.user_id AND f.retention_state='active') AS file_objects,
       (SELECT count(*)::integer FROM garage_review gr WHERE gr.author_user_id=r.user_id) AS garage_reviews,
       (SELECT count(*)::integer FROM content_report cr WHERE cr.reporter_user_id=r.user_id) AS content_reports,
       lp.version AS bound_version,lp.operator_approval_reference AS bound_approval_reference,lp.public_review_handling AS bound_review_handling,
       lp.review_evidence_retention_days AS bound_review_days,lp.repair_request_retention_days AS bound_request_days,
       lp.report_retention_days AS bound_report_days,lp.audit_log_retention_days AS bound_audit_days,lp.configured_at AS bound_configured_at
      FROM privacy_readiness r LEFT JOIN staff_identity s ON s.user_id=r.user_id LEFT JOIN lifecycle_policy lp ON lp.version=r.policy_version
      WHERE ($1::text IS NULL OR ($1='submitted' AND r.runnable) OR ($1='blocked' AND r.status<>'completed' AND NOT r.runnable) OR ($1='completed' AND r.status='completed'))
       AND ($2::text IS NULL OR r.id=$2)
      ORDER BY r.created_at,r.id LIMIT $3 OFFSET $4`,
      [status ?? null, requestId ?? null, limit, offset],
    );
  }
  private policyProjection(row: Record<string, unknown>) {
    return {
      version: row['version'] as string,
      operatorApprovalReference: row['operator_approval_reference'] as string,
      publicReviewHandling: row['public_review_handling'] as 'delete' | 'retain_anonymized',
      reviewEvidenceRetentionDays: row['review_evidence_retention_days'] as number,
      repairRequestRetentionDays: row['repair_request_retention_days'] as number,
      reportRetentionDays: row['report_retention_days'] as number,
      auditLogRetentionDays: row['audit_log_retention_days'] as number,
      configuredAt: (row['configured_at'] as Date).toISOString(),
    };
  }
  private privacyRequest(r: PrivacyRow): AdminPrivacyRequest {
    const boundPolicy = r.bound_version
      ? {
          version: r.bound_version,
          operatorApprovalReference: r.bound_approval_reference!,
          publicReviewHandling: r.bound_review_handling!,
          reviewEvidenceRetentionDays: r.bound_review_days!,
          repairRequestRetentionDays: r.bound_request_days!,
          reportRetentionDays: r.bound_report_days!,
          auditLogRetentionDays: r.bound_audit_days!,
          configuredAt: r.bound_configured_at!.toISOString(),
        }
      : undefined;
    return {
      id: r.id,
      userId: r.user_id,
      label: r.label,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      ...(r.policy_version ? { policyVersion: r.policy_version } : {}),
      activeOwnerships: r.ownerships,
      ownedGarages: r.owned_garages,
      pendingFileDeletions: r.pending_files,
      fileObjectCount: r.file_objects,
      garageReviewCount: r.garage_reviews,
      contentReportCount: r.content_reports,
      ownerOnlyObjectTypes: ['vehicles', 'repair_requests', 'garage_favorites'],
      runnable: r.runnable,
      ...(boundPolicy ? { boundPolicy } : {}),
    };
  }
  async auditPage(principal: Principal, filter: AdminFilter): Promise<AdminPage<AdminAuditEvent>> {
    const page = checkedPage(filter.page),
      query = checkedQuery(filter.query);
    return this.adminTransaction(principal, async (client) => {
      const result = await client.query<AdminAuditEvent>(
        `SELECT e.id,COALESCE(s.display_name,'Mitarbeitende') AS actor,
        e.subject_type AS "subjectType",e.subject_id AS "subjectId",e.event_type AS action,e.created_at::text AS "createdAt"
        FROM moderation_event e LEFT JOIN staff_identity s ON s.user_id=e.actor_user_id
        WHERE ($1='' OR e.event_type ILIKE $2 OR e.subject_id ILIKE $2)
        ORDER BY e.created_at DESC,e.id DESC LIMIT $3 OFFSET $4`,
        [query, '%' + escapeLike(query) + '%', ADMIN_PAGE_SIZE + 1, (page - 1) * ADMIN_PAGE_SIZE],
      );
      return {
        items: result.rows.slice(0, ADMIN_PAGE_SIZE),
        page,
        hasMore: result.rows.length > ADMIN_PAGE_SIZE,
      };
    });
  }
  async catalog(principal: Principal): Promise<AdminCatalog> {
    return this.adminTransaction(principal, async (client) => {
      const services = await client.query<AdminCatalogItem>(
        'SELECT id,label_de AS label,label_sq AS "labelSq",retired_at IS NOT NULL AS retired FROM service_category ORDER BY id LIMIT 200',
      );
      const makes = await client.query<AdminCatalogItem>(
        'SELECT id,label,retired_at IS NOT NULL AS retired FROM vehicle_make ORDER BY id LIMIT 200',
      );
      const places = await client.query<AdminCatalogItem>(
        'SELECT id,label,retired_at IS NOT NULL AS retired,source_name AS source,source_license AS license,source_checked_at::text AS "checkedAt" FROM place ORDER BY id LIMIT 200',
      );
      return { services: services.rows, makes: makes.rows, places: places.rows };
    });
  }
  private async members(client: pg.PoolClient, id: string): Promise<AdminMember[]> {
    return (
      await client.query<AdminMember>(
        `SELECT m.user_id AS "userId",COALESCE(s.display_name,m.user_id) AS label,m.role,m.state
      FROM membership m LEFT JOIN staff_identity s ON s.user_id=m.user_id WHERE m.garage_id=$1 ORDER BY m.role DESC,m.user_id LIMIT 200`,
        [id],
      )
    ).rows;
  }
  async decideGarage(
    principal: Principal,
    id: string,
    input: AdminGarageDecision,
  ): Promise<Pick<AdminGarageDetail, 'publicationState' | 'adminSuspended' | 'revision'>> {
    if (!validAdminDecision(input)) throw new AccessError(422, 'Invalid garage decision');
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    await this.reviewGarage(
      principal,
      id,
      input.decision === 'restore' ? 'published' : input.decision,
      input.verification,
      input,
    );
    const current = await this.garage(principal, id);
    return {
      publicationState: current.publicationState,
      adminSuspended: current.adminSuspended,
      revision: current.revision,
    };
  }
  async verifyGarage(
    principal: Principal,
    id: string,
    input: AdminRevision & {
      verification: VerificationChecklist;
      locationPoint?: { latitude: number; longitude: number };
    },
  ): Promise<void> {
    if (
      !validAdminDecision({
        revision: input.revision,
        reason: input.reason,
        decision: 'published',
        verification: input.verification,
      })
    )
      throw new AccessError(422, 'Invalid verification checklist');
    await this.adminTransaction(principal, async (client) => {
      await this.lockGarage(client, id, input);
      await this.noOwnGarage(client, principal, id);
      const current = await this.read(client, id);
      const profile = {
        ...current.profile,
        ...(input.locationPoint ? { locationPoint: input.locationPoint } : {}),
      };
      if (!validGarageProfile(profile, current.profile))
        throw new AccessError(422, 'Invalid garage profile or position');
      if (input.verification.location === 'verified' && !profile.locationPoint)
        throw new AccessError(422, 'An actual garage position is required');
      if (input.verification.companyDocument === 'verified') {
        const doc = await client.query(
          `SELECT 1 FROM garage_verification_document d JOIN file_object f ON f.id=d.file_id
          WHERE d.garage_id=$1 AND f.scan_state='clean' AND f.retention_state='active' FOR SHARE OF f`,
          [id],
        );
        if (!doc.rowCount) throw new AccessError(422, 'An available company document is required');
      }
      if (input.locationPoint)
        await client.query(
          "UPDATE garage SET location_point=ST_SetSRID(ST_MakePoint($3,$2),4326)::geography,location_source='operator_entered' WHERE id=$1",
          [id, input.locationPoint.latitude, input.locationPoint.longitude],
        );
      await client.query(
        `INSERT INTO garage_verification(garage_id,phone_state,contact_person_state,company_document_state,location_state,checked_by_user_id,checked_at)
        VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(garage_id) DO UPDATE SET phone_state=EXCLUDED.phone_state,
        contact_person_state=EXCLUDED.contact_person_state,company_document_state=EXCLUDED.company_document_state,
        location_state=EXCLUDED.location_state,checked_by_user_id=EXCLUDED.checked_by_user_id,checked_at=now()`,
        [
          id,
          input.verification.phone,
          input.verification.contactPerson,
          input.verification.companyDocument,
          input.verification.location,
          principal.userId,
        ],
      );
      await this.reasonAudit(client, principal, id, 'garage-verification-saved', input.reason);
    });
  }
  async decidePhoto(
    principal: Principal,
    garageId: string,
    photoId: string,
    input: AdminRevision & { approved: boolean },
  ): Promise<void> {
    if (!validAdminRevision(input) || typeof input.approved !== 'boolean')
      throw new AccessError(422, 'Invalid photo decision');
    await this.adminTransaction(principal, async (client) => {
      await this.lockGarage(client, garageId, input);
      await this.noOwnGarage(client, principal, garageId);
      const photo = await client.query<{ visibility: string; fixture_key: string | null }>(
        `SELECT p.visibility,f.fixture_key FROM garage_photo p LEFT JOIN local_demo_admin_photo f ON f.photo_id=p.id
         WHERE p.id=$1 AND p.garage_id=$2 FOR UPDATE OF p`,
        [photoId, garageId],
      );
      if (!photo.rows[0]) throw new AccessError(404, 'Photo not found');
      if (
        input.approved &&
        (!photo.rows[0].fixture_key ||
          !localDemoPhotoPath('demo-admin-fixture', photo.rows[0].fixture_key))
      )
        throw new AccessError(409, 'A configured safe photo source is required before approval');
      await client.query('UPDATE garage_photo SET visibility=$2 WHERE id=$1', [
        photoId,
        input.approved ? 'approved' : 'rejected',
      ]);
      await this.reasonAudit(
        client,
        principal,
        garageId,
        'garage-photo-' + (input.approved ? 'approved' : 'rejected'),
        input.reason,
      );
    });
  }
  private async lockGarage(client: pg.PoolClient, id: string, input: AdminRevision): Promise<void> {
    if (!validAdminRevision(input))
      throw new AccessError(422, 'A current garage revision and reason are required');
    const result = await client.query<{ admin_revision: number }>(
      'SELECT admin_revision FROM garage WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    if (!result.rows[0]) throw new AccessError(404, 'Garage not found');
    if (result.rows[0].admin_revision !== input.revision)
      throw new AccessError(409, 'Garage changed; reload before saving', 'admin_conflict');
  }
  private async noOwnGarage(
    client: pg.PoolClient,
    principal: Principal,
    id: string,
  ): Promise<void> {
    const own = await client.query(
      "SELECT 1 FROM membership WHERE garage_id=$1 AND user_id=$2 AND state='active' FOR SHARE",
      [id, principal.userId],
    );
    if (own.rowCount) throw new AccessError(403, 'A member cannot verify their own garage');
  }
  private async membershipAudit(
    client: pg.PoolClient,
    principal: Principal,
    garageId: string,
    userId: string,
    before: string,
    after: string,
  ): Promise<void> {
    // MEMBER-1/2: preserve who changed, not only the garage's current membership list.
    // The opaque compound subject is two IDs, never names, email or a support free text.
    await client.query(
      `INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type)
       VALUES($1,$2,'garage_membership',$3,$4)`,
      [
        randomUUID(),
        principal.userId,
        JSON.stringify([garageId, userId]),
        `membership-${before}-to-${after}`,
      ],
    );
  }
  private async reasonAudit(
    client: pg.PoolClient,
    principal: Principal,
    id: string,
    event: string,
    reason: string,
    subject = 'garage',
  ): Promise<void> {
    await client.query(
      'INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), principal.userId, subject, id, event],
    );
    await client.query(
      'INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), principal.userId, subject, id, 'admin-reason-' + reason],
    );
  }
  async changeMember(
    principal: Principal,
    id: string,
    input: AdminRevision & {
      userId: string;
      role: 'owner' | 'editor';
      state: 'active' | 'revoked';
    },
  ): Promise<void> {
    if (
      !validAdminRevision(input) ||
      !['owner', 'editor'].includes(input.role) ||
      !['active', 'revoked'].includes(input.state)
    )
      throw new AccessError(422, 'Invalid membership change');
    await this.adminTransaction(principal, async (client) => {
      await this.lockGarage(client, id, input);
      const target = await client.query(
        "SELECT id FROM app_user WHERE id=$1 AND status='active' FOR SHARE",
        [input.userId],
      );
      if (input.state === 'active' && !target.rowCount)
        throw new AccessError(422, 'Select an existing active account');
      const priorResult = await client.query<AdminMember>(
        'SELECT role,state FROM membership WHERE garage_id=$1 AND user_id=$2 FOR UPDATE',
        [id, input.userId],
      );
      const prior = priorResult.rows[0];
      if (!prior && !target.rowCount) throw new AccessError(404, 'Account not found');
      const garage = await this.read(client, id);
      const owners = await client.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM membership m JOIN app_user u ON u.id=m.user_id WHERE m.garage_id=$1 AND m.role='owner' AND m.state='active' AND u.status='active'",
        [id],
      );
      if (
        garage.publicationState === 'published' &&
        prior?.state === 'active' &&
        prior.role === 'owner' &&
        (input.state !== 'active' || input.role !== 'owner') &&
        owners.rows[0].count <= 1
      )
        throw new AccessError(
          409,
          'Transfer ownership or suspend the profile before removing the last owner',
        );
      if (prior?.role === input.role && prior.state === input.state) return;
      await client.query(
        `INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,garage_id) DO UPDATE SET role=EXCLUDED.role,state=EXCLUDED.state,granted_by=EXCLUDED.granted_by,granted_at=now()`,
        [input.userId, id, input.role, input.state, principal.userId],
      );
      if (input.state === 'active')
        await client.query("UPDATE app_user SET account_type='garage' WHERE id=$1", [input.userId]);
      await this.membershipAudit(
        client,
        principal,
        id,
        input.userId,
        prior ? `${prior.role}-${prior.state}` : 'absent',
        `${input.role}-${input.state}`,
      );
      await this.reasonAudit(
        client,
        principal,
        id,
        'garage-membership-' + input.state,
        input.reason,
      );
    });
  }
  async transferOwner(
    principal: Principal,
    id: string,
    input: AdminRevision & { fromUserId: string; toUserId: string },
  ): Promise<void> {
    if (
      !validAdminRevision(input) ||
      input.reason !== 'ownership_change' ||
      !input.fromUserId ||
      !input.toUserId ||
      input.fromUserId === input.toUserId
    )
      throw new AccessError(422, 'Invalid ownership transfer');
    await this.adminTransaction(principal, async (client) => {
      await this.lockGarage(client, id, input);
      const source = await client.query(
        "SELECT user_id FROM membership WHERE garage_id=$1 AND user_id=$2 AND role='owner' AND state='active' FOR UPDATE",
        [id, input.fromUserId],
      );
      const target = await client.query(
        "SELECT id FROM app_user WHERE id=$1 AND status='active' FOR SHARE",
        [input.toUserId],
      );
      if (!source.rowCount || !target.rowCount)
        throw new AccessError(422, 'Select an active owner and existing active target account');
      const previousTarget = await client.query<{ role: string; state: string }>(
        'SELECT role,state FROM membership WHERE garage_id=$1 AND user_id=$2 FOR UPDATE',
        [id, input.toUserId],
      );
      await client.query(
        `INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'owner','active',$3)
        ON CONFLICT(user_id,garage_id) DO UPDATE SET role='owner',state='active',granted_by=EXCLUDED.granted_by,granted_at=now()`,
        [input.toUserId, id, principal.userId],
      );
      await client.query(
        "UPDATE membership SET role='editor',granted_by=$3,granted_at=now() WHERE garage_id=$1 AND user_id=$2",
        [id, input.fromUserId, principal.userId],
      );
      await client.query("UPDATE app_user SET account_type='garage' WHERE id=$1", [input.toUserId]);
      const prior = previousTarget.rows[0];
      await this.membershipAudit(
        client,
        principal,
        id,
        input.fromUserId,
        'owner-active',
        'editor-active',
      );
      await this.membershipAudit(
        client,
        principal,
        id,
        input.toUserId,
        prior ? `${prior.role}-${prior.state}` : 'absent',
        'owner-active',
      );
      await this.reasonAudit(client, principal, id, 'garage-ownership-transferred', input.reason);
    });
  }
  async refreshDeletion(principal: Principal, id: string): Promise<void> {
    await this.adminTransaction(principal, async (client) => {
      const request = await client.query<{ user_id: string; status: string }>(
        'SELECT user_id,status FROM data_deletion_request WHERE id=$1 FOR UPDATE',
        [id],
      );
      const row = request.rows[0];
      if (!row) throw new AccessError(404, 'Deletion request not found');
      if (row.status === 'completed') throw new AccessError(409, 'Deletion already completed');
      const owners = await client.query(
        "SELECT 1 FROM membership WHERE user_id=$1 AND role='owner' AND state='active' FOR SHARE",
        [row.user_id],
      );
      // A request with an immutable binding never silently switches to a newer policy. Only a
      // no-policy request can acquire today's configured version via this explicit action.
      const policy =
        row.status === 'blocked_by_policy'
          ? await client.query<{ version: string }>(
              'SELECT version FROM lifecycle_policy ORDER BY configured_at DESC,version DESC LIMIT 1',
            )
          : await client.query<{ version: string }>(
              'SELECT version FROM lifecycle_policy WHERE version=(SELECT policy_version FROM data_deletion_request WHERE id=$1)',
              [id],
            );
      const status = owners.rowCount
        ? 'manual_content_decision_required'
        : policy.rowCount
          ? 'submitted'
          : 'blocked_by_policy';
      await client.query(
        'UPDATE data_deletion_request SET status=$2,policy_version=COALESCE(policy_version,$3) WHERE id=$1',
        [id, status, policy.rows[0]?.version ?? null],
      );
      await client.query(
        "UPDATE moderation_case SET status=$2 WHERE subject_type='data_deletion' AND subject_id=$1",
        [id, status === 'submitted' ? 'submitted' : 'waiting_for_subject'],
      );
      await this.reasonAudit(
        client,
        principal,
        id,
        'data-deletion-prerequisites-reviewed',
        'privacy_request',
        'data_deletion_request',
      );
    });
  }
  async assistedGarage(
    principal: Principal,
    input: {
      applicantUserId: string;
      profile: GarageProfileInput;
      consentVersion: string;
      requestReference: string;
    },
  ) {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    checkedReference(input.requestReference);
    return this.create(
      principal,
      input.applicantUserId,
      input.profile,
      { source: 'documented_support_request', version: input.consentVersion },
      input.requestReference.trim(),
    );
  }
  async correctProfile(
    principal: Principal,
    id: string,
    input: AdminRevision & { profile: GarageProfileInput; requestReference: string },
  ): Promise<void> {
    checkedReference(input.requestReference);
    await this.adminTransaction(principal, async (client) => {
      await this.lockGarage(client, id, input);
      const current = await this.read(client, id);
      if (current.publicationState === 'suspended')
        throw new AccessError(409, 'A suspended profile cannot be changed');
      if (
        input.reason !== 'documented_support' ||
        !validGarageProfile(input.profile, current.profile)
      )
        throw new AccessError(422, 'A valid profile and documented support request are required');
      const changed =
        current.profile.placeId !== input.profile.placeId ||
        current.profile.address !== input.profile.address ||
        JSON.stringify(current.profile.locationPoint) !==
          JSON.stringify(input.profile.locationPoint);
      await this.writeProfile(client, id, input.profile);
      if (changed)
        await client.query(
          "UPDATE garage_verification SET location_state='not_checked',checked_by_user_id=NULL,checked_at=NULL WHERE garage_id=$1",
          [id],
        );
      await client.query(
        "UPDATE garage SET publication_state=CASE WHEN publication_state='pending_review' THEN 'draft' ELSE publication_state END,admin_last_reason='documented_support' WHERE id=$1",
        [id],
      );
      await client.query(
        'INSERT INTO garage_support_request(id,garage_id,request_reference,recorded_by_user_id) VALUES($1,$2,$3,$4)',
        [randomUUID(), id, input.requestReference.trim(), principal.userId],
      );
      await this.reasonAudit(
        client,
        principal,
        id,
        'garage-support-corrected',
        'documented_support',
      );
    });
  }
  async submitSupported(
    principal: Principal,
    id: string,
    input: AdminRevision & { requestReference: string },
  ): Promise<void> {
    if (
      !principal.roles.has('admin') ||
      !validAdminRevision(input) ||
      input.reason !== 'documented_support'
    )
      throw new AccessError(403, 'Documented administrator access required');
    checkedReference(input.requestReference);
    await this.submitGarageForReview(principal, id, input);
  }
  async recordSessionRevocation(principal: Principal, userId: string): Promise<void> {
    await this.adminTransaction(principal, async (client) => {
      const result = await client.query('SELECT id FROM app_user WHERE id=$1 FOR SHARE', [userId]);
      if (!result.rowCount) throw new AccessError(404, 'Account not found');
      await this.reasonAudit(
        client,
        principal,
        userId,
        'local-app-session-revocation-requested',
        'policy_violation',
        'app_user',
      );
    });
  }
  private async adminTransaction<T>(
    principal: Principal,
    action: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    return this.transaction(principal, async (client) => {
      await assertCurrentStaffIdentity(client, principal);
      return action(client);
    });
  }
}
function checkedPage(page = 1): number {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw new AccessError(400, 'Invalid page');
  return page;
}
function checkedQuery(query = ''): string {
  if (typeof query !== 'string' || query.length > 120) throw new AccessError(400, 'Invalid search');
  return query.trim();
}
function checkedPrivacyRequestId(value: unknown): string | undefined {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value))
    throw new AccessError(400, 'Invalid deletion request');
  return value;
}
function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, '\\$&');
}
export function checkedReference(value: string): void {
  if (typeof value !== 'string' || value.trim().length < 5 || value.length > 200)
    throw new AccessError(422, 'A documented support request reference is required');
}
