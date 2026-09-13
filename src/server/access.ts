import { randomUUID } from 'node:crypto';
import type { RepairRequestInput } from '../shared/repair-request';
import { SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import {
  calculateOverallRating,
  emptyReviewSummary,
  isReviewEvidenceKind,
  isReviewRejectionReason,
  isReviewUpdateKind,
  isVisitMonth,
  REVIEW_LIMITS,
  reviewSummaryLabel,
  type OwnReview,
  type PublicReviewSummary,
  type PublicWorkshopReview,
  type ReviewDecisionInput,
  type ReviewEvidenceKind,
  type ReviewEvidenceStatus,
  type ReviewPublicFilter,
  type ReviewPublicationState,
  type ReviewRejectionReason,
  type ReviewRatings,
  type ReviewStore,
  type ReviewSubmissionInput,
  type ReviewUpdateKind,
} from './reviews';
import {
  findPublicWorkshops,
  type PublicWorkshopSearchInput,
  type PublicWorkshopSearchResponse,
} from './workshop-search';

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
  readonly reviewSummary?: PublicReviewSummary;
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
  readonly returnTo: string;
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
  reviewId?: string;
  retentionState: 'active' | 'deleted';
}

interface PrivateRepairRequest {
  readonly createdAt: string;
  readonly id: string;
  readonly input: RepairRequestInput;
  readonly ownerUserId: string;
}

export interface StoredRepairRequest {
  readonly areas: RepairRequestInput['areas'];
  readonly attachmentIds: readonly string[];
  readonly createdAt: string;
  readonly earliestDropoffOn: string;
  readonly id: string;
  readonly latestPickupOn: string;
  readonly serviceCategoryId: string;
  readonly stayEndsOn: string;
  readonly symptom?: string;
  readonly vehicle?: RepairRequestInput['vehicle'];
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

interface ReviewEvidence {
  readonly evidenceKind: ReviewEvidenceKind;
  readonly fileId: string;
  status: ReviewEvidenceStatus;
}

interface ReviewRecord {
  readonly authorUserId: string;
  readonly createdAt: string;
  readonly evidence: ReviewEvidence;
  readonly id: string;
  moderationAssignmentUserId?: string;
  publicationState: ReviewPublicationState;
  publishedAt?: string;
  readonly ratings: ReviewRatings;
  rejectionReason?: ReviewRejectionReason;
  readonly serviceCategoryId: string;
  readonly text: string;
  readonly updates: {
    readonly authorUserId: string;
    readonly createdAt: string;
    readonly kind: ReviewUpdateKind;
    readonly text: string;
  }[];
  readonly vehicleMakeId?: string;
  readonly visitMonth: string;
  readonly workshopId: string;
  workshopResponse?: {
    readonly createdAt: string;
    readonly workshopId: string;
    readonly text: string;
  };
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

export class AccessStore implements ReviewStore {
  readonly auditEvents: AuditEvent[] = [];
  private readonly files = new Map<string, PrivateFile>();
  private readonly memberships = new Map<string, Membership>();
  private readonly oidcTransactions = new Map<string, OidcTransaction>();
  private readonly repairRequests = new Map<string, PrivateRepairRequest>();
  private readonly reviews = new Map<string, ReviewRecord>();
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

  createOidcTransaction(state: string, codeVerifier: string, returnTo = '/') {
    this.oidcTransactions.set(state, {
      codeVerifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      returnTo,
    });
  }

  createRepairRequest(ownerUserId: string, input: RepairRequestInput): StoredRepairRequest {
    for (const fileId of input.attachmentIds ?? []) {
      const file = this.files.get(fileId);
      if (!file || file.ownerUserId !== ownerUserId) {
        throw new AccessError(404, 'Private file not found');
      }
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const storedInput = structuredClone(input);
    this.repairRequests.set(id, { createdAt, id, input: storedInput, ownerUserId });
    return this.toStoredRepairRequest({ createdAt, id, input: storedInput, ownerUserId });
  }

  createReview(principal: Principal, input: ReviewSubmissionInput): OwnReview {
    if (principal.roles.has('admin')) {
      throw new AccessError(403, 'An admin cannot submit a review on behalf of a customer');
    }
    this.validateReviewSubmission(input);
    const workshop = this.requireWorkshop(input.workshopId);
    if (workshop.publicationState !== 'published') {
      throw new AccessError(404, 'Published workshop not found');
    }
    const file = this.files.get(input.evidenceFileId);
    if (!file || file.ownerUserId !== principal.userId) {
      throw new AccessError(404, 'Private evidence file not found');
    }
    if (file.retentionState !== 'active' || file.reviewId) {
      throw new AccessError(409, 'A private evidence file can only support one review');
    }

    const id = randomUUID();
    const review: ReviewRecord = {
      authorUserId: principal.userId,
      createdAt: new Date().toISOString(),
      evidence: {
        evidenceKind: input.evidenceKind,
        fileId: input.evidenceFileId,
        status: 'submitted',
      },
      id,
      publicationState: 'submitted',
      ratings: {
        communication: input.communication,
        priceTransparency: input.priceTransparency,
        punctuality: input.punctuality,
        workQuality: input.workQuality,
      },
      serviceCategoryId: input.serviceCategoryId,
      text: input.text.trim(),
      updates: [],
      ...(input.vehicleMakeId ? { vehicleMakeId: input.vehicleMakeId } : {}),
      visitMonth: input.visitMonth,
      workshopId: input.workshopId,
    };
    file.reviewId = id;
    this.reviews.set(id, review);
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: id,
      type: 'review-submitted',
    });
    return this.toOwnReview(review);
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

  getRepairRequest(userId: string, repairRequestId: string): StoredRepairRequest {
    const request = this.repairRequests.get(repairRequestId);
    if (!request || request.ownerUserId !== userId) {
      throw new AccessError(404, 'Private repair request not found');
    }
    return this.toStoredRepairRequest(request);
  }

  createWorkshopDocumentGrant(principal: Principal, workshopId: string): FileGrant {
    this.requireWorkshopAccess(principal, workshopId);
    const fileId = randomUUID();
    this.files.set(fileId, { id: fileId, ownerUserId: principal.userId, retentionState: 'active' });
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
    this.files.set(fileId, { id: fileId, ownerUserId: userId, retentionState: 'active' });
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

  assignModerator(admin: Principal, reviewId: string, moderatorUserId: string): void {
    this.requireAdmin(admin);
    if (!this.ensureUser(moderatorUserId).has('moderator')) {
      throw new AccessError(422, 'A review can only be assigned to a moderator');
    }
    const review = this.requireReview(reviewId);
    if (review.publicationState !== 'submitted') {
      throw new AccessError(409, 'Only submitted reviews can be assigned for review');
    }
    if (review.authorUserId === moderatorUserId) {
      throw new AccessError(409, 'A reviewer cannot be assigned to their own review');
    }
    review.moderationAssignmentUserId = moderatorUserId;
    review.publicationState = 'under_review';
    review.evidence.status = 'under_review';
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: reviewId,
      type: 'review-moderator-assigned',
    });
  }

  decideReview(principal: Principal, reviewId: string, decision: ReviewDecisionInput): void {
    const review = this.requireModerationAccess(principal, reviewId);
    if (review.publicationState !== 'under_review') {
      throw new AccessError(409, 'Only reviews under review can receive a decision');
    }
    this.validateReviewDecision(decision);
    if (decision.decision === 'published') {
      const file = this.files.get(review.evidence.fileId);
      if (
        !file ||
        file.retentionState !== 'active' ||
        !decision.checklist.serviceMatches ||
        !decision.checklist.visitMonthMatches ||
        !decision.checklist.workshopMatches
      ) {
        throw new AccessError(
          422,
          'A review needs a checked private visit evidence before publication',
        );
      }
      review.evidence.status = 'verified';
      review.publicationState = 'published';
      review.publishedAt = new Date().toISOString();
    } else {
      review.evidence.status = 'not_verified';
      review.publicationState = 'rejected';
      review.rejectionReason = decision.rejectionReason;
    }
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: reviewId,
      type: `review-${decision.decision}`,
    });
  }

  deleteEvidenceAfterRetention(admin: Principal, reviewId: string): void {
    this.requireAdmin(admin);
    const review = this.requireReview(reviewId);
    if (review.publicationState !== 'published' || review.evidence.status !== 'verified') {
      throw new AccessError(409, 'Only verified evidence of a published review can be deleted');
    }
    const file = this.files.get(review.evidence.fileId);
    if (file) file.retentionState = 'deleted';
    review.evidence.status = 'deleted_after_retention';
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: reviewId,
      type: 'review-evidence-deleted-after-retention',
    });
  }

  deletePrivateFile(fileId: string): void {
    const file = this.files.get(fileId);
    if (file) file.retentionState = 'deleted';
  }

  issueEvidenceDownloadGrant(principal: Principal, reviewId: string): FileGrant {
    const review = this.requireReview(reviewId);
    const isOwner = review.authorUserId === principal.userId;
    const isAssignedModerator =
      principal.roles.has('moderator') && review.moderationAssignmentUserId === principal.userId;
    if (!isOwner && !principal.roles.has('admin') && !isAssignedModerator) {
      throw new AccessError(404, 'Private visit evidence not found');
    }
    const file = this.files.get(review.evidence.fileId);
    if (!file || file.retentionState !== 'active') {
      throw new AccessError(404, 'Private visit evidence not found');
    }
    return this.createGrant(file.id);
  }

  listOwnReviews(principal: Principal): readonly OwnReview[] {
    return [...this.reviews.values()]
      .filter((review) => review.authorUserId === principal.userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((review) => this.toOwnReview(review));
  }

  listPublicReviews(
    workshopId: string,
    filter: ReviewPublicFilter = {},
  ): readonly PublicWorkshopReview[] {
    return [...this.reviews.values()]
      .filter(
        (review) =>
          review.workshopId === workshopId &&
          review.publicationState === 'published' &&
          (review.evidence.status === 'verified' ||
            review.evidence.status === 'deleted_after_retention') &&
          (!filter.serviceCategoryId || review.serviceCategoryId === filter.serviceCategoryId) &&
          (!filter.vehicleMakeId || review.vehicleMakeId === filter.vehicleMakeId),
      )
      .sort(
        (left, right) =>
          right.visitMonth.localeCompare(left.visitMonth) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .map((review) => this.toPublicReview(review));
  }

  postReviewUpdate(
    principal: Principal,
    reviewId: string,
    kind: ReviewUpdateKind,
    text: string,
  ): void {
    const review = this.requireReview(reviewId);
    if (review.authorUserId !== principal.userId) {
      throw new AccessError(404, 'Review not found');
    }
    if (review.publicationState !== 'published') {
      throw new AccessError(409, 'Only published reviews can receive an update');
    }
    if (!isReviewUpdateKind(kind) || !this.isReviewText(text, REVIEW_LIMITS.maxUpdateLength)) {
      throw new AccessError(422, 'Review update is invalid');
    }
    review.updates.push({
      authorUserId: principal.userId,
      createdAt: new Date().toISOString(),
      kind,
      text: text.trim(),
    });
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: reviewId,
      type: `review-${kind}-added`,
    });
  }

  postWorkshopResponse(
    principal: Principal,
    workshopId: string,
    reviewId: string,
    text: string,
  ): void {
    this.requireWorkshopAccess(principal, workshopId);
    const review = this.requireReview(reviewId);
    if (review.workshopId !== workshopId) throw new AccessError(404, 'Published review not found');
    if (review.publicationState !== 'published') {
      throw new AccessError(404, 'Published review not found');
    }
    if (!this.isReviewText(text, REVIEW_LIMITS.maxResponseLength)) {
      throw new AccessError(422, 'Workshop response is invalid');
    }
    review.workshopResponse = {
      createdAt: new Date().toISOString(),
      text: text.trim(),
      workshopId,
    };
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: reviewId,
      type: 'review-workshop-response-posted',
    });
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
    if (
      !file ||
      file.retentionState !== 'active' ||
      (file.ownerUserId !== principal.userId && !principal.roles.has('admin'))
    ) {
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

  searchPublicWorkshops(input: PublicWorkshopSearchInput): PublicWorkshopSearchResponse {
    return findPublicWorkshops(this.listPublicWorkshops(), input);
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

  private toStoredRepairRequest(request: PrivateRepairRequest): StoredRepairRequest {
    return {
      areas: request.input.areas,
      attachmentIds: request.input.attachmentIds ?? [],
      createdAt: request.createdAt,
      earliestDropoffOn: request.input.earliestDropoffOn,
      id: request.id,
      latestPickupOn: request.input.latestPickupOn,
      serviceCategoryId: request.input.serviceCategoryId,
      stayEndsOn: request.input.stayEndsOn,
      symptom: request.input.symptom,
      vehicle: request.input.vehicle,
    };
  }

  private getPublicReviewSummary(workshopId: string): PublicReviewSummary {
    const reviews = this.listPublicReviews(workshopId);
    if (!reviews.length) return emptyReviewSummary();
    const totalRating = reviews.reduce((total, review) => total + review.ratings.overall, 0);
    const averageRating = Math.round((totalRating / reviews.length) * 10) / 10;
    return {
      averageRating,
      label: reviewSummaryLabel(reviews.length, averageRating),
      latestVisitMonth: reviews[0].visitMonth,
      reviewCount: reviews.length,
      state: 'available',
      // A retained public review still means the visit was checked historically. The file itself
      // has already become inaccessible after the documented deletion step.
      verifiedVisitCount: reviews.length,
    };
  }

  private isReviewText(value: string, maximum: number): boolean {
    const trimmed = value.trim();
    return trimmed.length >= REVIEW_LIMITS.minTextLength && trimmed.length <= maximum;
  }

  private requireModerationAccess(principal: Principal, reviewId: string): ReviewRecord {
    const review = this.requireReview(reviewId);
    if (review.authorUserId === principal.userId) {
      throw new AccessError(403, 'A reviewer cannot decide their own review');
    }
    if (principal.roles.has('admin')) return review;
    if (
      principal.roles.has('moderator') &&
      review.moderationAssignmentUserId === principal.userId
    ) {
      return review;
    }
    throw new AccessError(403, 'Moderator access denied for this review');
  }

  private requireReview(reviewId: string): ReviewRecord {
    const review = this.reviews.get(reviewId);
    if (!review) throw new AccessError(404, 'Review not found');
    return review;
  }

  private toOwnReview(review: ReviewRecord): OwnReview {
    return {
      evidenceStatus: review.evidence.status,
      id: review.id,
      publicationState: review.publicationState,
      ...(review.rejectionReason ? { rejectionReason: review.rejectionReason } : {}),
      ratings: { ...review.ratings, overall: calculateOverallRating(review.ratings) },
      serviceCategoryId: review.serviceCategoryId,
      visitMonth: review.visitMonth,
      workshopId: review.workshopId,
    };
  }

  private toPublicReview(review: ReviewRecord): PublicWorkshopReview {
    return {
      evidence: { label: 'Besuch belegt', state: 'verified' },
      id: review.id,
      ratings: { ...review.ratings, overall: calculateOverallRating(review.ratings) },
      serviceCategoryId: review.serviceCategoryId,
      text: review.text,
      updates: review.updates.map(({ createdAt, kind, text }) => ({ createdAt, kind, text })),
      ...(review.vehicleMakeId ? { vehicleMakeId: review.vehicleMakeId } : {}),
      visitMonth: review.visitMonth,
      ...(review.workshopResponse
        ? {
            workshopResponse: {
              createdAt: review.workshopResponse.createdAt,
              text: review.workshopResponse.text,
            },
          }
        : {}),
    };
  }

  private validateReviewDecision(decision: ReviewDecisionInput): void {
    const checklist = decision.checklist;
    if (decision.decision !== 'published' && decision.decision !== 'rejected') {
      throw new AccessError(422, 'Review decision is invalid');
    }
    if (
      !checklist ||
      typeof checklist.serviceMatches !== 'boolean' ||
      typeof checklist.visitMonthMatches !== 'boolean' ||
      typeof checklist.workshopMatches !== 'boolean'
    ) {
      throw new AccessError(422, 'Evidence checklist is invalid');
    }
    if (decision.decision === 'rejected' && !isReviewRejectionReason(decision.rejectionReason)) {
      throw new AccessError(422, 'A rejected review needs a reason for the author');
    }
  }

  private validateReviewSubmission(input: ReviewSubmissionInput): void {
    const ratings = [
      input.workQuality,
      input.communication,
      input.priceTransparency,
      input.punctuality,
    ];
    if (
      !input.workshopId ||
      !input.evidenceFileId ||
      !isReviewEvidenceKind(input.evidenceKind) ||
      !Object.hasOwn(SERVICE_CATEGORY_LABELS, input.serviceCategoryId) ||
      (input.vehicleMakeId && !Object.hasOwn(VEHICLE_MAKE_LABELS, input.vehicleMakeId)) ||
      !isVisitMonth(input.visitMonth) ||
      !this.isReviewText(input.text, REVIEW_LIMITS.maxTextLength) ||
      ratings.some((rating) => !Number.isInteger(rating) || rating < 1 || rating > 5)
    ) {
      throw new AccessError(422, 'Review submission is invalid');
    }
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
      reviewSummary: this.getPublicReviewSummary(workshop.id),
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
