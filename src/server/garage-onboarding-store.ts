import { assertCurrentStaffIdentity } from './staff-identity';
import {
  validAdminDecision,
  type AdminRevision,
  type AdminGarageDecision,
} from '../shared/administration';
import { randomUUID } from 'node:crypto';
import type { OwnGarageMembership } from '../shared/account';
import pg from 'pg';
import { AccessError, DuplicateGarageError, type Principal, type GarageConsent } from './access';
import {
  validGarageProfile,
  type GarageProfileInput,
  type GaragePublicationState,
  type VerificationChecklist,
} from '../shared/garage-onboarding';

export interface PrivateGarage {
  readonly adminRevision?: number;
  readonly canDelete?: boolean;
  readonly id: string;
  readonly profile: GarageProfileInput;
  readonly publicationState: GaragePublicationState;
  readonly consentVersion: string;
  readonly verification: VerificationChecklist;
}
export interface OwnedGarageSummary {
  readonly canDelete: boolean;
  readonly description?: string;
  readonly id: string;
  readonly name: string;
  readonly placeId: string;
  readonly publicationState: GaragePublicationState;
  readonly serviceCategoryIds: readonly string[];
  readonly updatedAt?: string;
}
type Maybe<T> = T | Promise<T>;
export interface GarageOnboardingStore {
  close?(): Promise<void>;
  getAccountType(principal: Principal): Maybe<'customer' | 'garage'>;
  deleteGarage(principal: Principal, garageId: string): Maybe<void>;
  listOwnMemberships(principal: Principal): Maybe<readonly OwnGarageMembership[]>;
  createGarageRegistration(
    principal: Principal,
    profile: GarageProfileInput,
    consentVersion: string,
  ): Maybe<{ id: string; publicationState: GaragePublicationState }>;
  getPrivateGarage(principal: Principal, garageId: string): Maybe<PrivateGarage>;
  listOwnedGarages(principal: Principal): Maybe<readonly OwnedGarageSummary[]>;
  updateGarageProfile(
    principal: Principal,
    garageId: string,
    profile: GarageProfileInput,
  ): Maybe<void>;
  submitGarageForReview(principal: Principal, garageId: string): Maybe<void>;
  reviewGarage(
    principal: Principal,
    garageId: string,
    decision: 'published' | 'rejected' | 'suspended',
    verification: VerificationChecklist,
    context?: AdminGarageDecision,
  ): Maybe<void>;
  createAssistedGarage(
    principal: Principal,
    applicantUserId: string,
    profile: GarageProfileInput,
    consent: GarageConsent,
  ): Maybe<{ id: string; publicationState: GaragePublicationState }>;
  listPublicDuplicateCandidates(name: string, placeId: string): Maybe<readonly unknown[]>;
}

// Onboarding uses the existing relational garage/point/membership model. No second position or
// browser-side persistence is introduced. Each save and its audit event commit together.
export class PostgresGarageOnboardingStore implements GarageOnboardingStore {
  protected readonly pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
  async getAccountType(principal: Principal): Promise<'customer' | 'garage'> {
    return this.transaction(principal, async (client) => {
      const result = await client.query(
        `SELECT CASE WHEN account_type='garage' OR EXISTS
          (SELECT 1 FROM membership m WHERE m.user_id=$1 AND m.state='active')
          THEN 'garage' ELSE 'customer' END AS type FROM app_user WHERE id=$1`,
        [principal.userId],
      );
      return result.rows[0].type;
    });
  }
  async deleteGarage(principal: Principal, id: string): Promise<void> {
    await this.transaction(principal, async (client) => {
      await this.authorize(client, principal, id);
      const owner = await client.query(
        "SELECT user_id FROM membership WHERE user_id=$1 AND garage_id=$2 AND state='active' AND role='owner' FOR SHARE",
        [principal.userId, id],
      );
      if (!owner.rowCount) throw new AccessError(403, 'Garage owner access required');
      await client.query(
        "UPDATE garage SET deleted_at=now(), publication_state='suspended' WHERE id=$1",
        [id],
      );
      await this.audit(client, principal, id, 'garage-deleted');
    });
  }
  async listPublicDuplicateCandidates(name: string, placeId: string) {
    const result = await this.pool.query(
      'SELECT id, name, place_id AS "placeId" FROM public_garage_profile WHERE lower(trim(name)) = lower(trim($1)) AND place_id = $2 ORDER BY id',
      [name, placeId],
    );
    return result.rows;
  }
  async createGarageRegistration(
    principal: Principal,
    profile: GarageProfileInput,
    consentVersion: string,
  ) {
    return this.create(principal, principal.userId, profile, {
      source: 'self_service',
      version: consentVersion,
    });
  }
  async createAssistedGarage(
    principal: Principal,
    applicantUserId: string,
    profile: GarageProfileInput,
    consent: GarageConsent,
  ) {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    if (consent.source !== 'documented_support_request')
      throw new AccessError(422, 'Documented consent required');
    return this.create(principal, applicantUserId, profile, consent);
  }
  protected async create(
    principal: Principal,
    owner: string,
    profile: GarageProfileInput,
    consent: GarageConsent,
    supportReference?: string,
  ) {
    if (!validGarageProfile(profile) || !consent.version.trim() || consent.version.length > 80)
      throw new AccessError(422, 'Invalid garage profile');
    return this.transaction(principal, async (client) => {
      if (supportReference) {
        await assertCurrentStaffIdentity(client, principal);
        const applicant = await client.query(
          "SELECT id FROM app_user WHERE id=$1 AND status='active' FOR SHARE",
          [owner],
        );
        if (!applicant.rowCount) throw new AccessError(422, 'Select an existing active applicant');
      }
      await this.ensureUser(client, owner);
      // Serialize the same normalized name/place so retries cannot create a second draft.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        profile.name.trim().toLowerCase() + ':' + profile.placeId,
      ]);
      const existing = await client.query(
        `SELECT id FROM garage WHERE lower(trim(name)) = lower(trim($1)) AND place_id = $2 AND deleted_at IS NULL
         UNION SELECT id FROM public_garage_profile WHERE lower(trim(name)) = lower(trim($1)) AND place_id = $2`,
        [profile.name, profile.placeId],
      );
      if (existing.rowCount) throw new DuplicateGarageError([]);
      const id = randomUUID();
      await client.query(
        "INSERT INTO garage (id, name, publication_state, created_by_user_id) VALUES ($1, $2, 'draft', $3)",
        [id, profile.name, owner],
      );
      await client.query(
        "INSERT INTO membership(user_id, garage_id, role, state, granted_by) VALUES($1,$2,'owner','active',$3)",
        [owner, id, principal.userId],
      );
      await client.query("UPDATE app_user SET account_type='garage' WHERE id=$1", [owner]);
      await this.writeProfile(client, id, profile);
      await client.query(
        'INSERT INTO garage_consent(id,garage_id,applicant_user_id,recorded_by_user_id,source,consent_version) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), id, owner, principal.userId, consent.source, consent.version],
      );
      await client.query(
        "INSERT INTO garage_verification(garage_id,phone_state,contact_person_state,company_document_state,location_state) VALUES($1,'not_checked','not_checked','not_checked','not_checked')",
        [id],
      );
      if (supportReference)
        await client.query(
          'INSERT INTO garage_support_request(id,garage_id,request_reference,recorded_by_user_id) VALUES($1,$2,$3,$4)',
          [randomUUID(), id, supportReference, principal.userId],
        );
      await this.audit(client, principal, id, 'garage-registration-started');
      return { id, publicationState: 'draft' as const };
    });
  }
  async listOwnMemberships(principal: Principal): Promise<readonly OwnGarageMembership[]> {
    return this.transaction(principal, async (client) => {
      const result = await client.query<OwnGarageMembership>(
        `SELECT m.garage_id AS "garageId", g.name AS "garageName", m.role
         FROM membership m JOIN garage g ON g.id = m.garage_id
         WHERE m.user_id = $1 AND m.state = 'active' AND g.deleted_at IS NULL ORDER BY m.garage_id`,
        [principal.userId],
      );
      return result.rows;
    });
  }
  async listOwnedGarages(principal: Principal) {
    return this.transaction(principal, async (client) => {
      const result = await client.query<
        Omit<OwnedGarageSummary, 'updatedAt'> & { readonly updatedAt?: Date }
      >(
        `SELECT w.id, w.name, w.publication_state AS "publicationState", w.place_id AS "placeId",
          w.description, w.updated_at AS "updatedAt",
          ARRAY(SELECT service_category_id FROM garage_service_category WHERE garage_id=w.id
            ORDER BY service_category_id) AS "serviceCategoryIds",
          EXISTS(SELECT 1 FROM membership owner WHERE owner.garage_id=w.id
            AND owner.user_id=$1 AND owner.state='active' AND owner.role='owner') AS "canDelete"
         FROM garage w JOIN membership m ON m.garage_id=w.id
         WHERE m.user_id=$1 AND m.state='active' AND w.deleted_at IS NULL
         ORDER BY w.name,w.id`,
        [principal.userId],
      );
      return result.rows.map(({ updatedAt, ...garage }) => ({
        ...garage,
        ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
      }));
    });
  }
  async getPrivateGarage(principal: Principal, id: string): Promise<PrivateGarage> {
    return this.transaction(principal, async (client) => {
      await this.authorize(client, principal, id);
      const garage = await this.read(client, id);
      const owner = await client.query(
        "SELECT 1 FROM membership WHERE user_id=$1 AND garage_id=$2 AND state='active' AND role='owner'",
        [principal.userId, id],
      );
      return { ...garage, canDelete: !!owner.rowCount };
    });
  }
  async updateGarageProfile(
    principal: Principal,
    id: string,
    profile: GarageProfileInput,
  ): Promise<void> {
    await this.transaction(principal, async (client) => {
      await this.authorize(client, principal, id);
      if (principal.roles.has('admin')) {
        const own = await client.query(
          "SELECT 1 FROM membership WHERE garage_id=$1 AND user_id=$2 AND state='active'",
          [id, principal.userId],
        );
        if (!own.rowCount)
          throw new AccessError(
            403,
            'Administrative corrections require a documented support request',
          );
      }
      const existing = await this.read(client, id);
      if (existing.publicationState === 'suspended') throw new AccessError(409, 'Suspended garage');
      if (!validGarageProfile(profile, existing.profile))
        throw new AccessError(422, 'Invalid garage profile');
      const changed =
        existing.profile.placeId !== profile.placeId ||
        existing.profile.address !== profile.address ||
        JSON.stringify(existing.profile.locationPoint) !== JSON.stringify(profile.locationPoint);
      await this.writeProfile(client, id, profile);
      if (changed)
        await client.query(
          "UPDATE garage_verification SET location_state='not_checked', checked_at=NULL, checked_by_user_id=NULL WHERE garage_id=$1",
          [id],
        );
      await client.query(
        "UPDATE garage SET publication_state=CASE WHEN publication_state='pending_review' THEN 'draft' ELSE publication_state END WHERE id=$1",
        [id],
      );
      await this.audit(client, principal, id, 'garage-profile-updated');
    });
  }
  async submitGarageForReview(
    principal: Principal,
    id: string,
    context?: AdminRevision & { requestReference: string },
  ): Promise<void> {
    await this.transaction(principal, async (client) => {
      await this.authorize(client, principal, id);
      const garage = await this.read(client, id);
      if (context) {
        await assertCurrentStaffIdentity(client, principal);
        if (
          !principal.roles.has('admin') ||
          context.reason !== 'documented_support' ||
          context.requestReference.trim().length < 5
        )
          throw new AccessError(403, 'A documented administrative request is required');
        if (context.revision !== garage.adminRevision)
          throw new AccessError(409, 'Garage changed before submission');
        await client.query(
          'INSERT INTO garage_support_request(id,garage_id,request_reference,recorded_by_user_id) VALUES($1,$2,$3,$4)',
          [randomUUID(), id, context.requestReference.trim(), principal.userId],
        );
      } else if (principal.roles.has('admin')) {
        const own = await client.query(
          "SELECT 1 FROM membership WHERE garage_id=$1 AND user_id=$2 AND state='active'",
          [id, principal.userId],
        );
        if (!own.rowCount)
          throw new AccessError(
            403,
            'Administrative submission requires a documented support request',
          );
      }
      if (!validGarageProfile(garage.profile, garage.profile))
        throw new AccessError(422, 'Invalid garage profile');
      if (!['draft', 'rejected'].includes(garage.publicationState))
        throw new AccessError(409, 'Invalid garage state');
      await client.query("UPDATE garage SET publication_state='pending_review' WHERE id=$1", [id]);
      await this.audit(client, principal, id, 'garage-submitted');
    });
  }
  async reviewGarage(
    principal: Principal,
    id: string,
    decision: 'published' | 'rejected' | 'suspended',
    verification: VerificationChecklist,
    context?: AdminGarageDecision,
  ): Promise<void> {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    await this.transaction(principal, async (client) => {
      await this.authorize(client, principal, id);
      const garage = await this.read(client, id);
      if (context) {
        if (!validAdminDecision(context))
          throw new AccessError(422, 'Invalid administrative decision');
        await assertCurrentStaffIdentity(client, principal);
        if (garage.adminRevision !== context.revision)
          throw new AccessError(
            409,
            'The garage changed; reload before deciding',
            'admin_conflict',
          );
      }
      const state = await client.query<{
        admin_suspended: boolean;
        moderation_hidden_case_id: string | null;
      }>('SELECT admin_suspended,moderation_hidden_case_id FROM garage WHERE id=$1', [id]);
      const restoring = context?.decision === 'restore';
      const adminSuspendingHidden =
        context?.decision === 'suspended' &&
        garage.publicationState === 'suspended' &&
        !!state.rows[0]?.moderation_hidden_case_id;
      const valid =
        (garage.publicationState === 'pending_review' &&
          ['published', 'rejected'].includes(decision)) ||
        (garage.publicationState === 'published' && decision === 'suspended') ||
        adminSuspendingHidden ||
        (restoring &&
          decision === 'published' &&
          garage.publicationState === 'suspended' &&
          state.rows[0]?.admin_suspended &&
          !state.rows[0]?.moderation_hidden_case_id);
      if (!valid) throw new AccessError(409, 'Invalid garage state', 'admin_blocked');
      const involved = await client.query(
        "SELECT 1 FROM membership WHERE garage_id=$1 AND user_id=$2 AND state='active'",
        [id, principal.userId],
      );
      if (involved.rowCount)
        throw new AccessError(
          403,
          'A garage member cannot approve their own garage',
          'admin_blocked',
        );
      const profile = {
        ...garage.profile,
        ...(context?.locationPoint ? { locationPoint: context.locationPoint } : {}),
      };
      // A point is part of the same domain transaction even for a negative decision.
      // Validate it before any visibility, verification or audit write can occur.
      if (context?.locationPoint && !validGarageProfile(profile, garage.profile))
        throw new AccessError(
          422,
          'A complete profile and valid actual garage point are required',
          'admin_blocked',
        );
      if (
        decision === 'published' &&
        ['phone', 'contactPerson', 'companyDocument', 'location'].some(
          (key) => verification[key as keyof VerificationChecklist] !== 'verified',
        )
      )
        throw new AccessError(422, 'All company verification checks are required', 'admin_blocked');
      if (context && decision === 'published') {
        if (!validGarageProfile(profile, garage.profile) || !profile.locationPoint)
          throw new AccessError(
            422,
            'A complete profile and actual garage point are required',
            'admin_blocked',
          );
        const proof = await client.query(
          `SELECT 1 FROM garage_verification_document d JOIN file_object f ON f.id=d.file_id
          WHERE d.garage_id=$1 AND f.scan_state='clean' AND f.retention_state='active' FOR SHARE OF f`,
          [id],
        );
        const owners = await client.query(
          "SELECT 1 FROM membership m JOIN app_user u ON u.id=m.user_id WHERE m.garage_id=$1 AND m.role='owner' AND m.state='active' AND u.status='active' FOR SHARE OF m,u",
          [id],
        );
        if (!proof.rowCount || !owners.rowCount)
          throw new AccessError(
            422,
            'Available company evidence and an active owner are required',
            'admin_blocked',
          );
      }
      if (context?.locationPoint)
        await client.query(
          "UPDATE garage SET location_point=ST_SetSRID(ST_MakePoint($3,$2),4326)::geography,location_source='operator_entered' WHERE id=$1",
          [id, context.locationPoint.latitude, context.locationPoint.longitude],
        );
      await client.query(
        'UPDATE garage SET publication_state=$2,moderation_hidden_case_id=NULL WHERE id=$1',
        [id, decision],
      );
      await client.query(
        'UPDATE garage_verification SET phone_state=$2,contact_person_state=$3,company_document_state=$4,location_state=$5,checked_by_user_id=$6,checked_at=now() WHERE garage_id=$1',
        [
          id,
          verification.phone,
          verification.contactPerson,
          verification.companyDocument,
          verification.location,
          principal.userId,
        ],
      );
      if (context) {
        await client.query(
          'UPDATE garage SET admin_suspended=$2,admin_last_reason=$3 WHERE id=$1',
          [id, decision === 'suspended', context.reason],
        );
        await this.audit(client, principal, id, 'admin-reason-' + context.reason);
      }
      await this.audit(client, principal, id, 'garage-' + decision);
    });
  }
  protected async authorize(
    client: pg.PoolClient,
    principal: Principal,
    id: string,
  ): Promise<void> {
    // Locks prevent membership revocation or another profile update from racing a save.
    const garage = await client.query(
      'SELECT id FROM garage WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    if (!garage.rowCount) throw new AccessError(403, 'Garage access denied');
    if (principal.roles.has('admin')) return;
    const membership = await client.query(
      "SELECT user_id FROM membership WHERE user_id=$1 AND garage_id=$2 AND state='active' AND role IN ('owner','editor') FOR SHARE",
      [principal.userId, id],
    );
    if (!membership.rowCount) throw new AccessError(403, 'Garage access denied');
  }
  protected async read(client: pg.PoolClient, id: string): Promise<PrivateGarage> {
    const result = await client.query(
      `SELECT w.id, w.admin_revision AS "adminRevision", w.publication_state AS "publicationState", c.consent_version AS "consentVersion",
      jsonb_build_object('phone',v.phone_state,'contactPerson',v.contact_person_state,'companyDocument',v.company_document_state,'location',v.location_state) AS verification,
      jsonb_strip_nulls(jsonb_build_object('name',w.name,'placeId',w.place_id,'address',w.business_address,'contactPerson',w.contact_person,'contactPhone',w.contact_phone,'publicPhone',w.public_phone,'publicWhatsapp',w.public_whatsapp,'contactEmail',w.contact_email,'description',w.description,'languages',w.languages,'selfReportedSpecializations',w.self_reported_specializations,
      'serviceCategoryIds',ARRAY(SELECT service_category_id FROM garage_service_category WHERE garage_id=w.id ORDER BY service_category_id),
      'vehicleMakeIds',ARRAY(SELECT vehicle_make_id FROM garage_vehicle_make WHERE garage_id=w.id ORDER BY vehicle_make_id),
      'locationPoint',CASE WHEN w.location_point IS NOT NULL THEN jsonb_build_object('latitude',ST_Y(w.location_point::geometry),'longitude',ST_X(w.location_point::geometry)) END)) AS profile
      FROM garage w LEFT JOIN garage_consent c ON c.garage_id=w.id LEFT JOIN garage_verification v ON v.garage_id=w.id WHERE w.id=$1`,
      [id],
    );
    if (!result.rows[0]) throw new AccessError(404, 'Garage not found');
    return result.rows[0];
  }
  protected async writeProfile(
    client: pg.PoolClient,
    id: string,
    profile: GarageProfileInput,
  ): Promise<void> {
    await client.query(
      `UPDATE garage SET name=$2,place_id=$3,business_address=$4,contact_person=$5,contact_phone=$6,public_phone=$7,contact_email=$8,description=$9,public_whatsapp=$14,languages=$10,self_reported_specializations=$11,
      location_source=CASE WHEN $12::double precision IS NULL THEN NULL WHEN location_point IS NOT DISTINCT FROM ST_SetSRID(ST_MakePoint($13,$12),4326)::geography THEN location_source ELSE 'self_reported' END,
      location_point=CASE WHEN $12::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($13,$12),4326)::geography END WHERE id=$1`,
      [
        id,
        profile.name.trim(),
        profile.placeId,
        profile.address ?? null,
        profile.contactPerson.trim(),
        profile.contactPhone.trim(),
        profile.publicPhone ?? null,
        profile.contactEmail ?? null,
        profile.description ?? null,
        profile.languages,
        profile.selfReportedSpecializations,
        profile.locationPoint?.latitude ?? null,
        profile.locationPoint?.longitude ?? null,
        profile.publicWhatsapp ?? false,
      ],
    );
    await client.query(
      'DELETE FROM garage_service_category WHERE garage_id=$1 AND NOT(service_category_id=ANY($2::text[]))',
      [id, profile.serviceCategoryIds],
    );
    await client.query(
      'INSERT INTO garage_service_category(garage_id,service_category_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',
      [id, profile.serviceCategoryIds],
    );
    await client.query(
      'DELETE FROM garage_vehicle_make WHERE garage_id=$1 AND NOT(vehicle_make_id=ANY($2::text[]))',
      [id, profile.vehicleMakeIds],
    );
    await client.query(
      'INSERT INTO garage_vehicle_make(garage_id,vehicle_make_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',
      [id, profile.vehicleMakeIds],
    );
  }
  private async ensureUser(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      "INSERT INTO app_user(id,oidc_subject,status) VALUES($1,$1,'active') ON CONFLICT DO NOTHING",
      [id],
    );
    const active = await client.query(
      "SELECT id FROM app_user WHERE id=$1 AND status='active' FOR SHARE",
      [id],
    );
    if (!active.rowCount) throw new AccessError(403, 'Account unavailable');
  }
  protected async audit(
    client: pg.PoolClient,
    principal: Principal,
    id: string,
    event: string,
  ): Promise<void> {
    await client.query(
      "INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type) VALUES($1,$2,'garage',$3,$4)",
      [randomUUID(), principal.userId, id, event],
    );
  }
  protected async transaction<T>(
    principal: Principal,
    action: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.system_role',$2,true)",
        [principal.userId, principal.roles.has('admin') ? 'admin' : 'customer'],
      );
      await this.ensureUser(client, principal.userId);
      const result = await action(client);
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
