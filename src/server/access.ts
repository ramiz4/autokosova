import { randomUUID } from 'node:crypto';

export type SystemRole = 'admin' | 'customer' | 'moderator';
export type MembershipRole = 'editor' | 'owner';
export type WorkshopPublicationState =
  'draft' | 'pending_review' | 'published' | 'rejected' | 'suspended';
export type VerificationCheckState = 'not_checked' | 'verified' | 'failed';

export interface Principal {
  readonly userId: string;
  readonly roles: ReadonlySet<SystemRole>;
  readonly sessionId: string;
  readonly csrfToken: string;
}

export interface FileGrant {
  readonly expiresAt: string;
  readonly fileId: string;
  readonly grantId: string;
}

export interface WorkshopProfileInput {
  readonly contactEmail?: string;
  readonly contactPerson: string;
  readonly contactPhone: string;
  readonly description?: string;
  readonly languages: readonly string[];
  readonly name: string;
  readonly placeId: string;
  readonly publicPhone?: string;
  readonly selfReportedSpecializations: readonly string[];
  readonly serviceCategoryIds: readonly string[];
  readonly vehicleMakeIds: readonly string[];
}

export interface WorkshopConsent {
  readonly source: 'self_service' | 'documented_support_request';
  readonly version: string;
}

export interface VerificationChecklist {
  readonly companyDocument: VerificationCheckState;
  readonly contactPerson: VerificationCheckState;
  readonly location: VerificationCheckState;
  readonly phone: VerificationCheckState;
}

export interface PublicWorkshopProfile {
  readonly contact: { readonly phone?: string };
  readonly description?: string;
  readonly id: string;
  readonly languages: readonly string[];
  readonly name: string;
  readonly photoIds: readonly string[];
  readonly placeId: string;
  readonly selfReportedSpecializations: readonly string[];
  readonly serviceCategoryIds: readonly string[];
  readonly vehicleMakeIds: readonly string[];
  readonly verificationLabel?: 'Unternehmensdaten geprüft';
}

interface Session {
  readonly csrfToken: string;
  readonly expiresAt: Date;
  readonly userId: string;
}

interface OidcTransaction {
  readonly codeVerifier: string;
  readonly expiresAt: Date;
}

interface Vehicle {
  readonly id: string;
  readonly label: string;
  readonly ownerUserId: string;
}

interface Membership {
  readonly role: MembershipRole;
  readonly state: 'active' | 'revoked';
  readonly userId: string;
  readonly workshopId: string;
}

interface PrivateFile {
  readonly id: string;
  readonly ownerUserId: string;
}

interface Workshop {
  readonly consent: WorkshopConsent;
  readonly createdByUserId: string;
  readonly id: string;
  profile: WorkshopProfileInput;
  publicationState: WorkshopPublicationState;
  verification: VerificationChecklist;
}

interface WorkshopDocument {
  readonly fileId: string;
  readonly workshopId: string;
}

interface WorkshopPhoto {
  readonly content: Buffer;
  readonly contentType: 'image/webp';
  readonly height: number;
  readonly id: string;
  readonly uploadedByUserId: string;
  visibility: 'pending_review' | 'approved' | 'rejected';
  readonly width: number;
  readonly workshopId: string;
}

export interface AuditEvent {
  readonly actorUserId: string;
  readonly subjectId?: string;
  readonly type: string;
}

export class AccessError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class DuplicateWorkshopError extends AccessError {
  constructor(readonly publicMatches: readonly PublicWorkshopProfile[]) {
    super(409, 'A possible duplicate requires review before a new workshop can be created');
  }
}

export class AccessStore {
  readonly auditEvents: AuditEvent[] = [];
  private readonly files = new Map<string, PrivateFile>();
  private readonly memberships = new Map<string, Membership>();
  private readonly oidcTransactions = new Map<string, OidcTransaction>();
  private readonly sessions = new Map<string, Session>();
  private readonly users = new Map<string, Set<SystemRole>>();
  private readonly vehicles = new Map<string, Vehicle>();
  private readonly workshopDocuments = new Map<string, WorkshopDocument>();
  private readonly workshopPhotos = new Map<string, WorkshopPhoto>();
  private readonly workshops = new Map<string, Workshop>();

  addMembership(
    userId: string,
    workshopId: string,
    role: MembershipRole,
    state: 'active' | 'revoked' = 'active',
  ) {
    this.memberships.set(`${userId}:${workshopId}`, { role, state, userId, workshopId });
  }

  addRole(userId: string, role: SystemRole) {
    this.ensureUser(userId).add(role);
  }

  createAssistedWorkshop(
    admin: Principal,
    applicantUserId: string,
    profile: WorkshopProfileInput,
    consent: WorkshopConsent,
  ) {
    this.requireAdmin(admin);
    if (consent.source !== 'documented_support_request') {
      throw new AccessError(422, 'Admin-assisted onboarding requires documented consent');
    }
    const workshop = this.createWorkshop(applicantUserId, profile, consent);
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: workshop.id,
      type: 'workshop-consent-recorded',
    });
    return workshop;
  }

  createSession(userId: string, expiresAt = new Date(Date.now() + 60 * 60 * 1000)) {
    this.ensureUser(userId);
    const sessionId = randomUUID();
    const csrfToken = randomUUID();
    this.sessions.set(sessionId, { csrfToken, expiresAt, userId });
    return { csrfToken, sessionId };
  }

  createWorkshopRegistration(
    principal: Principal,
    profile: WorkshopProfileInput,
    consentVersion: string,
  ) {
    return this.createWorkshop(principal.userId, profile, {
      source: 'self_service',
      version: consentVersion,
    });
  }

  createOidcTransaction(state: string, codeVerifier: string) {
    this.oidcTransactions.set(state, {
      codeVerifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
  }

  createVehicle(ownerUserId: string, label: string) {
    const id = randomUUID();
    this.vehicles.set(id, { id, label, ownerUserId });
    return id;
  }

  consumeOidcTransaction(state: string, now = new Date()) {
    const transaction = this.oidcTransactions.get(state);
    this.oidcTransactions.delete(state);
    if (!transaction || transaction.expiresAt <= now) return undefined;
    return transaction;
  }

  createWorkshopDocumentGrant(principal: Principal, workshopId: string): FileGrant {
    this.requireWorkshopAccess(principal, workshopId);
    const fileId = randomUUID();
    this.files.set(fileId, { id: fileId, ownerUserId: principal.userId });
    this.workshopDocuments.set(fileId, { fileId, workshopId });
    return this.createGrant(fileId);
  }

  getFileGrant(userId: string, contentType: string, sizeBytes: number): FileGrant {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(contentType)) {
      throw new AccessError(415, 'Unsupported file type');
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) {
      throw new AccessError(413, 'Invalid file size');
    }
    const fileId = randomUUID();
    this.files.set(fileId, { id: fileId, ownerUserId: userId });
    return this.createGrant(fileId);
  }

  getPrincipal(sessionId: string | undefined, now = new Date()): Principal | undefined {
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return {
      csrfToken: session.csrfToken,
      roles: this.ensureUser(session.userId),
      sessionId,
      userId: session.userId,
    };
  }

  getPrivateWorkshop(principal: Principal, workshopId: string) {
    this.requireWorkshopAccess(principal, workshopId);
    const workshop = this.requireWorkshop(workshopId);
    return {
      consentVersion: workshop.consent.version,
      id: workshop.id,
      profile: workshop.profile,
      publicationState: workshop.publicationState,
      verification: workshop.verification,
    };
  }

  getPublicWorkshop(workshopId: string): PublicWorkshopProfile | undefined {
    const workshop = this.workshops.get(workshopId);
    if (!workshop || workshop.publicationState !== 'published') return undefined;
    return this.toPublicWorkshop(workshop);
  }

  getWorkshopPhoto(
    workshopId: string,
    photoId: string,
    principal?: Principal,
  ): WorkshopPhoto | undefined {
    const photo = this.workshopPhotos.get(photoId);
    if (!photo || photo.workshopId !== workshopId) return undefined;
    const workshop = this.requireWorkshop(workshopId);
    if (principal) {
      this.requireWorkshopAccess(principal, workshopId);
      return photo;
    }
    if (workshop.publicationState !== 'published' || photo.visibility !== 'approved')
      return undefined;
    return photo;
  }

  issueDownloadGrant(principal: Principal, fileId: string): FileGrant {
    const workshopDocument = this.workshopDocuments.get(fileId);
    if (workshopDocument) {
      this.requireWorkshopAccess(principal, workshopDocument.workshopId);
      return this.createGrant(fileId);
    }
    const file = this.files.get(fileId);
    if (!file || (file.ownerUserId !== principal.userId && !principal.roles.has('admin'))) {
      throw new AccessError(404, 'Private file not found');
    }
    return this.createGrant(fileId);
  }

  listOwnedWorkshops(principal: Principal) {
    return [...this.workshops.values()]
      .filter((workshop) => this.hasWorkshopAccess(principal, workshop.id))
      .map((workshop) => ({
        id: workshop.id,
        name: workshop.profile.name,
        publicationState: workshop.publicationState,
      }));
  }

  listPublicDuplicateCandidates(name: string, placeId: string) {
    return [...this.workshops.values()]
      .filter(
        (workshop) =>
          workshop.publicationState === 'published' &&
          sameWorkshopName(workshop.profile.name, name) &&
          workshop.profile.placeId === placeId,
      )
      .map((workshop) => this.toPublicWorkshop(workshop));
  }

  listPublicWorkshops() {
    return [...this.workshops.values()]
      .filter((workshop) => workshop.publicationState === 'published')
      .map((workshop) => this.toPublicWorkshop(workshop));
  }

  listVehicles(userId: string) {
    return [...this.vehicles.values()]
      .filter((vehicle) => vehicle.ownerUserId === userId)
      .map(({ id, label }) => ({ id, label }));
  }

  publishWorkshopPhoto(admin: Principal, workshopId: string, photoId: string, approved: boolean) {
    this.requireAdmin(admin);
    const photo = this.workshopPhotos.get(photoId);
    if (!photo || photo.workshopId !== workshopId)
      throw new AccessError(404, 'Workshop photo not found');
    photo.visibility = approved ? 'approved' : 'rejected';
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: photoId,
      type: approved ? 'workshop-photo-approved' : 'workshop-photo-rejected',
    });
  }

  registerWorkshopPhoto(
    principal: Principal,
    workshopId: string,
    normalized: Omit<WorkshopPhoto, 'id' | 'uploadedByUserId' | 'visibility' | 'workshopId'>,
  ) {
    this.requireWorkshopAccess(principal, workshopId);
    const id = randomUUID();
    this.workshopPhotos.set(id, {
      ...normalized,
      id,
      uploadedByUserId: principal.userId,
      visibility: 'pending_review',
      workshopId,
    });
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: id,
      type: 'workshop-photo-uploaded',
    });
    return { id, ...normalized };
  }

  requireWorkshopMembership(principal: Principal, workshopId: string) {
    this.requireWorkshopAccess(principal, workshopId);
  }

  revokeSession(sessionId: string | undefined) {
    if (sessionId) this.sessions.delete(sessionId);
  }

  reviewWorkshop(
    admin: Principal,
    workshopId: string,
    decision: 'published' | 'rejected' | 'suspended',
    verification: VerificationChecklist,
  ) {
    this.requireAdmin(admin);
    const workshop = this.requireWorkshop(workshopId);
    const validDecisions: Readonly<Record<WorkshopPublicationState, readonly string[]>> = {
      draft: [],
      pending_review: ['published', 'rejected'],
      published: ['suspended'],
      rejected: [],
      suspended: [],
    };
    if (!validDecisions[workshop.publicationState].includes(decision)) {
      throw new AccessError(409, 'This workshop state cannot take the requested decision');
    }
    workshop.publicationState = decision;
    workshop.verification = verification;
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: workshopId,
      type: `workshop-${decision}`,
    });
  }

  submitWorkshopForReview(principal: Principal, workshopId: string) {
    this.requireWorkshopAccess(principal, workshopId);
    const workshop = this.requireWorkshop(workshopId);
    if (!['draft', 'rejected'].includes(workshop.publicationState)) {
      throw new AccessError(409, 'Only a draft or rejected workshop can be submitted for review');
    }
    this.validateProfile(workshop.profile);
    workshop.publicationState = 'pending_review';
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: workshopId,
      type: 'workshop-submitted',
    });
  }

  updateWorkshopProfile(principal: Principal, workshopId: string, profile: WorkshopProfileInput) {
    this.requireWorkshopAccess(principal, workshopId);
    const workshop = this.requireWorkshop(workshopId);
    if (workshop.publicationState === 'suspended') {
      throw new AccessError(409, 'A suspended workshop cannot be changed through self-service');
    }
    this.validateProfile(profile);
    workshop.profile = this.copyProfile(profile);
    if (workshop.publicationState === 'pending_review') workshop.publicationState = 'draft';
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: workshopId,
      type: 'workshop-profile-updated',
    });
  }

  private createGrant(fileId: string): FileGrant {
    return {
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      fileId,
      grantId: randomUUID(),
    };
  }

  private createWorkshop(userId: string, profile: WorkshopProfileInput, consent: WorkshopConsent) {
    if (!consent.version || consent.version.length > 80) {
      throw new AccessError(422, 'A current onboarding consent version is required');
    }
    this.validateProfile(profile);
    const duplicateCandidates = this.listPublicDuplicateCandidates(profile.name, profile.placeId);
    const privateDuplicateExists = [...this.workshops.values()].some(
      (workshop) =>
        workshop.publicationState !== 'published' &&
        sameWorkshopName(workshop.profile.name, profile.name) &&
        workshop.profile.placeId === profile.placeId,
    );
    if (duplicateCandidates.length > 0 || privateDuplicateExists) {
      throw new DuplicateWorkshopError(duplicateCandidates);
    }
    const id = randomUUID();
    const workshop: Workshop = {
      consent,
      createdByUserId: userId,
      id,
      profile: this.copyProfile(profile),
      publicationState: 'draft',
      verification: {
        companyDocument: 'not_checked',
        contactPerson: 'not_checked',
        location: 'not_checked',
        phone: 'not_checked',
      },
    };
    this.workshops.set(id, workshop);
    this.addMembership(userId, id, 'owner');
    this.auditEvents.push({
      actorUserId: userId,
      subjectId: id,
      type: 'workshop-registration-started',
    });
    return workshop;
  }

  private copyProfile(profile: WorkshopProfileInput): WorkshopProfileInput {
    return {
      ...profile,
      languages: [...profile.languages],
      selfReportedSpecializations: [...profile.selfReportedSpecializations],
      serviceCategoryIds: [...profile.serviceCategoryIds],
      vehicleMakeIds: [...profile.vehicleMakeIds],
    };
  }

  private ensureUser(userId: string) {
    const current = this.users.get(userId);
    if (current) return current;
    const roles = new Set<SystemRole>(['customer']);
    this.users.set(userId, roles);
    return roles;
  }

  private hasWorkshopAccess(principal: Principal, workshopId: string) {
    if (principal.roles.has('admin')) return this.workshops.has(workshopId);
    const membership = this.memberships.get(`${principal.userId}:${workshopId}`);
    return membership?.state === 'active' && ['editor', 'owner'].includes(membership.role);
  }

  private requireAdmin(principal: Principal) {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
  }

  private requireWorkshop(workshopId: string) {
    const workshop = this.workshops.get(workshopId);
    if (!workshop) throw new AccessError(404, 'Workshop not found');
    return workshop;
  }

  private requireWorkshopAccess(principal: Principal, workshopId: string) {
    if (!this.hasWorkshopAccess(principal, workshopId)) {
      throw new AccessError(403, 'Workshop access denied');
    }
  }

  private toPublicWorkshop(workshop: Workshop): PublicWorkshopProfile {
    const allCompanyDataVerified = Object.values(workshop.verification).every(
      (state) => state === 'verified',
    );
    return {
      contact: workshop.profile.publicPhone ? { phone: workshop.profile.publicPhone } : {},
      description: workshop.profile.description,
      id: workshop.id,
      languages: [...workshop.profile.languages],
      name: workshop.profile.name,
      photoIds: [...this.workshopPhotos.values()]
        .filter((photo) => photo.workshopId === workshop.id && photo.visibility === 'approved')
        .map((photo) => photo.id),
      placeId: workshop.profile.placeId,
      selfReportedSpecializations: [...workshop.profile.selfReportedSpecializations],
      serviceCategoryIds: [...workshop.profile.serviceCategoryIds],
      vehicleMakeIds: [...workshop.profile.vehicleMakeIds],
      ...(allCompanyDataVerified ? { verificationLabel: 'Unternehmensdaten geprüft' } : {}),
    };
  }

  private validateProfile(profile: WorkshopProfileInput) {
    const requiredValues = [
      profile.name,
      profile.placeId,
      profile.contactPerson,
      profile.contactPhone,
    ];
    if (requiredValues.some((value) => !value.trim())) {
      throw new AccessError(
        422,
        'Workshop name, location and verified contact fields are required',
      );
    }
    if (profile.serviceCategoryIds.length === 0 || profile.languages.length === 0) {
      throw new AccessError(422, 'At least one service and language are required');
    }
    for (const values of [
      profile.languages,
      profile.selfReportedSpecializations,
      profile.serviceCategoryIds,
      profile.vehicleMakeIds,
    ]) {
      if (new Set(values).size !== values.length || values.some((value) => !value.trim())) {
        throw new AccessError(422, 'Profile lists must contain unique non-empty values');
      }
    }
  }
}

function sameWorkshopName(left: string, right: string) {
  return left.trim().toLocaleLowerCase('de-DE') === right.trim().toLocaleLowerCase('de-DE');
}
