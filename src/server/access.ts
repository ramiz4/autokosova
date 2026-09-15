import { validateRepairRequest } from '../shared/repair-request-validation';
import {
  repairRequestSummary,
  validRepairRequestPageOptions,
  type RepairRequestPage,
  type RepairRequestPageOptions,
  type SavedRepairRequest,
  type RepairRequestMutation,
} from '../shared/saved-repair-request';
import type {
  GaragePublicationState,
  GarageLocationPoint,
  GarageProfileInput,
  VerificationChecklist,
} from '../shared/garage-onboarding';
import { validGarageProfile } from '../shared/garage-onboarding';
export type {
  GaragePublicationState,
  GarageLocationPoint,
  GarageProfileInput,
  VerificationChecklist,
} from '../shared/garage-onboarding';
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
  type PublicGarageReview,
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
  findPublicGarages,
  type PublicGarageSearchArea,
  type PublicGarageSearchInput,
  type PublicGarageSearchResponse,
  type PublicGarageSearchResult,
} from './garage-search';
import {
  isModerationAction,
  isModerationReasonCode,
  isModerationReportCategory,
  isModerationSubjectType,
  priorityForReport,
  type AppealInput,
  type ContentReportInput,
  type DataDeletionRequest,
  type ModerationActionInput,
  type ModerationCaseDetail,
  type ModerationCaseStatus,
  type ModerationCaseSummary,
  type ModerationPriority,
  type ModerationReasonCode,
  type ModerationReportCategory,
  type ModerationSubjectType,
  type RetentionPolicy,
  type RetentionPolicyInput,
} from './moderation';

import {
  APPLICATION_ROLES,
  type ApplicationRole,
  type AccountProfile,
  type OwnGarageMembership,
} from '../shared/account';
export type SystemRole = ApplicationRole;
export type MembershipRole = 'editor' | 'owner';
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

export interface GarageConsent {
  readonly source: 'self_service' | 'documented_support_request';
  readonly version: string;
}

export interface PublicGarageProfile {
  readonly contact: { readonly phone?: string; readonly whatsapp?: boolean };
  readonly description?: string;
  readonly id: string;
  readonly languages: readonly string[];
  /** Internal-only search data; public route serializers must remove this field. */
  readonly locationPoint?: GarageLocationPoint;
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
  readonly profile: AccountProfile;
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
  readonly garageId: string;
}

interface PrivateFile {
  readonly id: string;
  readonly ownerUserId: string;
  readonly storageKey: string;
  reviewId?: string;
  retentionState: 'active' | 'deleted';
}

interface PrivateRepairRequest {
  readonly active: boolean;
  readonly revision: number;
  readonly updatedAt: string;
  readonly createdAt: string;
  readonly id: string;
  readonly input: RepairRequestInput;
  readonly ownerUserId: string;
}

export type StoredRepairRequest = SavedRepairRequest;

interface Garage {
  readonly consent: GarageConsent;
  readonly createdByUserId: string;
  readonly id: string;
  profile: GarageProfileInput;
  publicationState: GaragePublicationState;
  verification: VerificationChecklist;
}

interface GarageDocument {
  readonly fileId: string;
  readonly garageId: string;
}

interface GaragePhoto {
  readonly content: Buffer;
  readonly contentType: 'image/webp';
  readonly height: number;
  readonly id: string;
  readonly uploadedByUserId: string;
  visibility: 'pending_review' | 'approved' | 'rejected';
  readonly width: number;
  readonly garageId: string;
}

interface ReviewEvidence {
  readonly evidenceKind: ReviewEvidenceKind;
  readonly fileId: string;
  status: ReviewEvidenceStatus;
}

interface ReviewRecord {
  authorUserId: string;
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
  readonly garageId: string;
  garageResponse?: {
    readonly createdAt: string;
    readonly garageId: string;
    readonly text: string;
  };
}

interface ModerationCaseRecord {
  assignedModeratorUserId?: string;
  createdAt: string;
  readonly id: string;
  readonly priority: ModerationPriority;
  reasonCode?: ModerationReasonCode;
  readonly report?: {
    readonly category: ModerationReportCategory;
    readonly details?: string;
    readonly reporterUserId: string;
  };
  status: ModerationCaseStatus;
  readonly subjectId: string;
  readonly subjectType: ModerationSubjectType | 'data_deletion';
}

interface AppealRecord {
  readonly caseId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly message: string;
  readonly appellantUserId: string;
}

export interface PersonalDataExport {
  readonly favoriteGarageIds: readonly string[];
  readonly exportedAt: string;
  readonly files: readonly { readonly id: string; readonly status: 'active' | 'deleted' }[];
  readonly repairRequests: readonly StoredRepairRequest[];
  readonly reviews: readonly OwnReview[];
  readonly vehicles: readonly { readonly id: string; readonly label: string }[];
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

export class DuplicateGarageError extends AccessError {
  constructor(readonly publicMatches: readonly PublicGarageProfile[]) {
    super(409, 'A possible duplicate requires review before a new garage can be created');
  }
}

export class AccessStore implements ReviewStore {
  readonly auditEvents: AuditEvent[] = [];
  private readonly favorites = new Map<string, Set<string>>();
  private readonly appeals = new Map<string, AppealRecord>();
  private readonly deletionRequests = new Map<string, DataDeletionRequest>();
  private readonly deletedStorageKeys = new Set<string>();
  private readonly files = new Map<string, PrivateFile>();
  private readonly memberships = new Map<string, Membership>();
  private readonly moderationCases = new Map<string, ModerationCaseRecord>();
  private readonly oidcTransactions = new Map<string, OidcTransaction>();
  private readonly repairRequests = new Map<string, PrivateRepairRequest>();
  private readonly reviews = new Map<string, ReviewRecord>();
  private readonly sessions = new Map<string, Session>();
  private readonly users = new Map<string, Set<SystemRole>>();
  private readonly vehicles = new Map<string, Vehicle>();
  private readonly garageDocuments = new Map<string, GarageDocument>();
  private readonly garagePhotos = new Map<string, GaragePhoto>();
  private readonly garages = new Map<string, Garage>();
  private retentionPolicy?: RetentionPolicy;

  addMembership(
    userId: string,
    garageId: string,
    role: MembershipRole,
    state: 'active' | 'revoked' = 'active',
  ) {
    this.memberships.set(`${userId}:${garageId}`, { role, state, userId, garageId });
  }

  addRole(userId: string, role: SystemRole) {
    this.ensureUser(userId).add(role);
  }

  /** Test-only local object-storage probe; production needs the queued provider worker in #17. */
  wasPrivateObjectDeleted(fileId: string): boolean {
    return this.deletedStorageKeys.has(`quarantine/${fileId}`);
  }

  configureRetentionPolicy(admin: Principal, input: RetentionPolicyInput): RetentionPolicy {
    this.requireAdmin(admin);
    const numericValues = [
      input.reviewEvidenceRetentionDays,
      input.repairRequestRetentionDays,
      input.reportRetentionDays,
      input.auditLogRetentionDays,
    ];
    if (
      !input.version.trim() ||
      !input.operatorApprovalReference.trim() ||
      !['delete', 'retain_anonymized'].includes(input.publicReviewHandling) ||
      numericValues.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 3650)
    ) {
      throw new AccessError(422, 'Retention policy is incomplete');
    }
    this.retentionPolicy = { ...input, configuredAt: new Date().toISOString() };
    for (const request of this.deletionRequests.values()) {
      if (request.status !== 'blocked_by_policy') continue;
      request.status = 'submitted';
      request.policyVersion = input.version;
      const caseRecord = this.moderationCases.get(request.id);
      if (caseRecord) caseRecord.status = 'submitted';
    }
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: input.version,
      type: 'retention-policy-configured',
    });
    return this.retentionPolicy;
  }

  createContentReport(principal: Principal, input: ContentReportInput): ModerationCaseSummary {
    if (
      !isModerationSubjectType(input.subjectType) ||
      !input.subjectId.trim() ||
      !isModerationReportCategory(input.category) ||
      (input.details !== undefined &&
        (input.details.trim().length < 20 || input.details.trim().length > 1200))
    ) {
      throw new AccessError(422, 'Report is invalid');
    }
    this.requireReportableSubject(input.subjectType, input.subjectId);
    const duplicate = [...this.moderationCases.values()].some(
      (record) =>
        record.report?.reporterUserId === principal.userId &&
        record.subjectType === input.subjectType &&
        record.subjectId === input.subjectId &&
        ['submitted', 'assigned', 'waiting_for_subject'].includes(record.status),
    );
    if (duplicate) throw new AccessError(409, 'This content already has an open report');
    const record: ModerationCaseRecord = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      priority: priorityForReport(input.category),
      report: {
        category: input.category,
        ...(input.details?.trim() ? { details: input.details.trim() } : {}),
        reporterUserId: principal.userId,
      },
      status: 'submitted',
      subjectId: input.subjectId,
      subjectType: input.subjectType,
    };
    this.moderationCases.set(record.id, record);
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: record.id,
      type: 'content-report-submitted',
    });
    return this.toModerationCaseSummary(record);
  }

  assignModerationCase(admin: Principal, caseId: string, moderatorUserId: string): void {
    this.requireAdmin(admin);
    if (!this.ensureUser(moderatorUserId).has('moderator')) {
      throw new AccessError(422, 'A case can only be assigned to a moderator');
    }
    const record = this.requireModerationCase(caseId);
    if (!['submitted', 'assigned'].includes(record.status)) {
      throw new AccessError(409, 'Only an open moderation case can be assigned');
    }
    record.assignedModeratorUserId = moderatorUserId;
    record.status = 'assigned';
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: caseId,
      type: 'moderation-case-assigned',
    });
  }

  applyModerationAction(
    principal: Principal,
    caseId: string,
    input: ModerationActionInput,
  ): ModerationCaseSummary {
    if (!isModerationAction(input.action) || !isModerationReasonCode(input.reasonCode)) {
      throw new AccessError(422, 'Moderation action is invalid');
    }
    const record = this.requireModerationCase(caseId);
    this.requireCaseAccess(principal, record);
    if (record.subjectType === 'data_deletion') {
      throw new AccessError(409, 'Data deletion uses its dedicated workflow');
    }
    if (input.action === 'temporarily_hide' || input.action === 'restore') {
      this.changeSubjectVisibility(record.subjectType, record.subjectId, input.action);
      record.status = 'resolved';
    } else if (input.action === 'request_information') {
      record.status = 'waiting_for_subject';
    } else if (input.action === 'approve') {
      record.status = 'resolved';
    } else {
      record.status = 'rejected';
    }
    record.reasonCode = input.reasonCode;
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: caseId,
      type: `moderation-case-${input.action}`,
    });
    return this.toModerationCaseSummary(record);
  }

  createAppeal(principal: Principal, input: AppealInput): string {
    if (
      !input.caseId.trim() ||
      input.message.trim().length < 20 ||
      input.message.trim().length > 1200
    ) {
      throw new AccessError(422, 'Appeal is invalid');
    }
    const record = this.requireModerationCase(input.caseId);
    if (!['resolved', 'rejected'].includes(record.status) || !this.canAppeal(principal, record)) {
      throw new AccessError(403, 'Appeal is not available for this moderation case');
    }
    const appealId = randomUUID();
    this.appeals.set(appealId, {
      appellantUserId: principal.userId,
      caseId: record.id,
      createdAt: new Date().toISOString(),
      id: appealId,
      message: input.message.trim(),
    });
    record.status = 'submitted';
    record.reasonCode = 'missing_information';
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: record.id,
      type: 'moderation-appeal-submitted',
    });
    return appealId;
  }

  getModerationCase(principal: Principal, caseId: string): ModerationCaseDetail {
    const record = this.requireModerationCase(caseId);
    this.requireCaseAccess(principal, record);
    return this.toModerationCaseDetail(record);
  }

  listModerationQueue(principal: Principal): readonly ModerationCaseSummary[] {
    if (principal.roles.has('admin')) {
      return this.toSortedModerationSummaries([
        ...this.toSortedModerationQueue([...this.moderationCases.values()]),
        ...this.pendingSubjectQueue(),
      ]);
    }
    if (!principal.roles.has('moderator')) throw new AccessError(403, 'Moderator access denied');
    return this.toSortedModerationSummaries([
      ...this.toSortedModerationQueue(
        [...this.moderationCases.values()].filter(
          (record) => record.assignedModeratorUserId === principal.userId,
        ),
      ),
      ...this.pendingSubjectQueue(principal.userId),
    ]);
  }

  listOwnModerationCases(principal: Principal): readonly ModerationCaseSummary[] {
    return this.toSortedModerationQueue(
      [...this.moderationCases.values()].filter((record) => this.canAppeal(principal, record)),
    );
  }

  listFavoriteGarageIds(ownerUserId: string): readonly string[] {
    return [...(this.favorites.get(ownerUserId) ?? [])];
  }
  saveFavorite(ownerUserId: string, garageId: string): void {
    const favorites = this.favorites.get(ownerUserId) ?? new Set<string>();
    favorites.add(garageId);
    this.favorites.set(ownerUserId, favorites);
  }
  removeFavorite(ownerUserId: string, garageId: string): void {
    this.favorites.get(ownerUserId)?.delete(garageId);
  }

  exportPersonalData(principal: Principal): PersonalDataExport {
    return {
      exportedAt: new Date().toISOString(),
      favoriteGarageIds: this.listFavoriteGarageIds(principal.userId),
      files: [...this.files.values()]
        .filter((file) => file.ownerUserId === principal.userId)
        .map((file) => ({ id: file.id, status: file.retentionState })),
      repairRequests: [...this.repairRequests.values()]
        .filter((request) => request.ownerUserId === principal.userId)
        .map((request) => this.toStoredRepairRequest(request)),
      reviews: this.listOwnReviews(principal),
      vehicles: this.listVehicles(principal.userId),
    };
  }

  requestPersonalDataDeletion(principal: Principal): DataDeletionRequest {
    const existing = [...this.deletionRequests.values()].find(
      (request) => request.userId === principal.userId && request.status !== 'completed',
    );
    if (existing) return { ...existing };
    const ownsGarage = [...this.memberships.values()].some(
      (membership) =>
        membership.userId === principal.userId &&
        membership.role === 'owner' &&
        membership.state === 'active',
    );
    const request: DataDeletionRequest = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      status: ownsGarage
        ? 'manual_content_decision_required'
        : this.retentionPolicy
          ? 'submitted'
          : 'blocked_by_policy',
      userId: principal.userId,
      ...(this.retentionPolicy ? { policyVersion: this.retentionPolicy.version } : {}),
    };
    this.deletionRequests.set(request.id, request);
    this.moderationCases.set(request.id, {
      createdAt: request.createdAt,
      id: request.id,
      priority: 'normal',
      status: request.status === 'submitted' ? 'submitted' : 'waiting_for_subject',
      subjectId: request.id,
      subjectType: 'data_deletion',
    });
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: request.id,
      type: 'personal-data-deletion-requested',
    });
    return { ...request };
  }

  listDataDeletionRequests(admin: Principal): readonly DataDeletionRequest[] {
    this.requireAdmin(admin);
    return [...this.deletionRequests.values()].map((request) => ({ ...request }));
  }

  processPersonalDataDeletion(admin: Principal, requestId: string): void {
    this.requireAdmin(admin);
    const request = this.deletionRequests.get(requestId);
    if (!request) throw new AccessError(404, 'Data deletion request not found');
    if (
      request.status !== 'submitted' ||
      !this.retentionPolicy ||
      request.policyVersion !== this.retentionPolicy.version
    ) {
      throw new AccessError(409, 'Data deletion requires the configured operator policy');
    }
    const userId = request.userId;
    this.favorites.delete(userId);
    for (const [id, repairRequest] of this.repairRequests) {
      if (repairRequest.ownerUserId === userId) this.repairRequests.delete(id);
    }
    for (const [id, vehicle] of this.vehicles) {
      if (vehicle.ownerUserId === userId) this.vehicles.delete(id);
    }
    for (const [id, review] of this.reviews) {
      if (review.authorUserId !== userId) continue;
      const file = this.files.get(review.evidence.fileId);
      if (file) file.retentionState = 'deleted';
      if (
        review.publicationState === 'published' &&
        this.retentionPolicy.publicReviewHandling === 'retain_anonymized'
      ) {
        review.authorUserId = `anonymized-review-author-${review.id}`;
        review.evidence.status = 'deleted_after_retention';
      } else {
        this.reviews.delete(id);
      }
    }
    for (const [id, file] of this.files) {
      if (file.ownerUserId === userId) {
        this.deletedStorageKeys.add(file.storageKey);
        this.files.delete(id);
      }
    }
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(sessionId);
    }
    for (const [key, membership] of this.memberships) {
      if (membership.userId === userId) this.memberships.delete(key);
    }
    this.users.delete(userId);
    request.status = 'completed';
    const caseRecord = this.moderationCases.get(requestId);
    if (caseRecord) {
      caseRecord.status = 'resolved';
      caseRecord.reasonCode = 'no_violation';
    }
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: requestId,
      type: 'personal-data-deletion-completed',
    });
  }

  createAssistedGarage(
    admin: Principal,
    applicantUserId: string,
    profile: GarageProfileInput,
    consent: GarageConsent,
  ) {
    this.requireAdmin(admin);
    if (consent.source !== 'documented_support_request') {
      throw new AccessError(422, 'Admin-assisted onboarding requires documented consent');
    }
    const garage = this.createGarage(applicantUserId, profile, consent);
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: garage.id,
      type: 'garage-consent-recorded',
    });
    return garage;
  }

  createSession(
    userId: string,
    expiresAt = new Date(Date.now() + 60 * 60 * 1000),
    profile: AccountProfile = {},
  ) {
    this.ensureUser(userId);
    const sessionId = randomUUID();
    const csrfToken = randomUUID();
    this.sessions.set(sessionId, {
      csrfToken,
      expiresAt,
      userId,
      profile: {
        ...(profile.displayName ? { displayName: profile.displayName } : {}),
        ...(profile.username ? { username: profile.username } : {}),
        ...(profile.email ? { email: profile.email } : {}),
      },
    });
    return { csrfToken, sessionId };
  }

  getOwnAccount(principal: Principal) {
    const current = this.getPrincipal(principal.sessionId);
    if (!current || current.userId !== principal.userId) {
      throw new AccessError(401, 'Authentication required');
    }
    const session = this.sessions.get(current.sessionId)!;
    return {
      userId: current.userId,
      ...session.profile,
      roles: APPLICATION_ROLES.filter((role) => current.roles.has(role)),
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  listOwnMemberships(principal: Principal): readonly OwnGarageMembership[] {
    // Admin access to a garage is not a membership. Never use hasGarageAccess here.
    return [...this.memberships.values()]
      .filter(
        (membership) => membership.userId === principal.userId && membership.state === 'active',
      )
      .map((membership) => ({
        garageId: membership.garageId,
        ...(this.garages.get(membership.garageId)?.profile.name
          ? { garageName: this.garages.get(membership.garageId)!.profile.name }
          : {}),
        role: membership.role,
      }))
      .sort((a, b) => a.garageId.localeCompare(b.garageId));
  }

  setVerifiedRoles(userId: string, roles: readonly ('admin' | 'moderator')[]): void {
    this.users.set(userId, new Set<SystemRole>(['customer', ...roles]));
  }

  createGarageRegistration(
    principal: Principal,
    profile: GarageProfileInput,
    consentVersion: string,
  ) {
    return this.createGarage(principal.userId, profile, {
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
    this.repairRequests.set(id, {
      active: true,
      revision: 1,
      updatedAt: createdAt,
      createdAt,
      id,
      input: storedInput,
      ownerUserId,
    });
    return this.toStoredRepairRequest({
      active: true,
      revision: 1,
      updatedAt: createdAt,
      createdAt,
      id,
      input: storedInput,
      ownerUserId,
    });
  }

  createReview(principal: Principal, input: ReviewSubmissionInput): OwnReview {
    if (principal.roles.has('admin')) {
      throw new AccessError(403, 'An admin cannot submit a review on behalf of a customer');
    }
    this.validateReviewSubmission(input);
    const garage = this.requireGarage(input.garageId);
    if (garage.publicationState !== 'published') {
      throw new AccessError(404, 'Published garage not found');
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
      garageId: input.garageId,
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

  listRepairRequests(ownerUserId: string, options: RepairRequestPageOptions): RepairRequestPage {
    if (!validRepairRequestPageOptions(options)) throw new AccessError(400, 'Invalid request page');
    const own = [...this.repairRequests.values()]
      .filter((request) => request.ownerUserId === ownerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const cursorIndex = options.cursor ? own.findIndex((item) => item.id === options.cursor) : -1;
    if (options.cursor && cursorIndex < 0) throw new AccessError(404, 'Request page unavailable');
    const page = own
      .slice(cursorIndex + 1)
      .filter(
        (item) =>
          !options.activity ||
          options.activity === 'all' ||
          item.active === (options.activity === 'active'),
      )
      .slice(0, options.limit + 1);
    const requests = page
      .slice(0, options.limit)
      .map((item) => repairRequestSummary(this.toStoredRepairRequest(item)));
    return {
      requests,
      nextCursor: page.length > options.limit ? requests[requests.length - 1].id : null,
    };
  }

  mutateRepairRequest(
    ownerUserId: string,
    id: string,
    revision: number,
    mutation: RepairRequestMutation,
    authorize: () => void = () => undefined,
  ): StoredRepairRequest | null {
    const request = this.repairRequests.get(id);
    if (!request || request.ownerUserId !== ownerUserId)
      throw new AccessError(404, 'Private repair request not found');
    if (request.revision !== revision)
      throw new AccessError(409, 'Request changed; reload before saving');
    authorize();
    if (mutation.kind === 'delete') {
      this.repairRequests.delete(id);
      return null;
    }
    if (mutation.kind === 'update') {
      const error = validateRepairRequest(mutation.input);
      if (error) throw new AccessError(400, error);
      for (const fileId of mutation.input.attachmentIds ?? []) {
        const file = this.files.get(fileId);
        if (
          !file ||
          file.ownerUserId !== ownerUserId ||
          (file.retentionState !== 'active' && !request.input.attachmentIds?.includes(fileId))
        )
          throw new AccessError(404, 'Private file not found');
      }
    }
    const changed: PrivateRepairRequest = {
      ...request,
      active: mutation.kind === 'activity' ? mutation.active : request.active,
      input: mutation.kind === 'update' ? structuredClone(mutation.input) : request.input,
      revision: request.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.repairRequests.set(id, changed);
    return this.toStoredRepairRequest(changed);
  }

  getRepairRequest(userId: string, repairRequestId: string): StoredRepairRequest {
    const request = this.repairRequests.get(repairRequestId);
    if (!request || request.ownerUserId !== userId) {
      throw new AccessError(404, 'Private repair request not found');
    }
    return this.toStoredRepairRequest(request);
  }

  createGarageDocumentGrant(principal: Principal, garageId: string): FileGrant {
    this.requireGarageAccess(principal, garageId);
    const fileId = randomUUID();
    this.files.set(fileId, {
      id: fileId,
      ownerUserId: principal.userId,
      retentionState: 'active',
      storageKey: `quarantine/${fileId}`,
    });
    this.garageDocuments.set(fileId, { fileId, garageId });
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
    this.files.set(fileId, {
      id: fileId,
      ownerUserId: userId,
      retentionState: 'active',
      storageKey: `quarantine/${fileId}`,
    });
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

  getPrivateGarage(principal: Principal, garageId: string) {
    this.requireGarageAccess(principal, garageId);
    const garage = this.requireGarage(garageId);
    return {
      consentVersion: garage.consent.version,
      id: garage.id,
      profile: garage.profile,
      publicationState: garage.publicationState,
      verification: garage.verification,
    };
  }

  getPublicGarage(garageId: string): PublicGarageProfile | undefined {
    const garage = this.garages.get(garageId);
    if (!garage || garage.publicationState !== 'published') return undefined;
    return this.toPublicGarage(garage);
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
        !decision.checklist.garageMatches
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
    garageId: string,
    filter: ReviewPublicFilter = {},
  ): readonly PublicGarageReview[] {
    return [...this.reviews.values()]
      .filter(
        (review) =>
          review.garageId === garageId &&
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

  postGarageResponse(principal: Principal, garageId: string, reviewId: string, text: string): void {
    this.requireGarageAccess(principal, garageId);
    const review = this.requireReview(reviewId);
    if (review.garageId !== garageId) throw new AccessError(404, 'Published review not found');
    if (review.publicationState !== 'published') {
      throw new AccessError(404, 'Published review not found');
    }
    if (!this.isReviewText(text, REVIEW_LIMITS.maxResponseLength)) {
      throw new AccessError(422, 'Garage response is invalid');
    }
    review.garageResponse = {
      createdAt: new Date().toISOString(),
      text: text.trim(),
      garageId,
    };
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: reviewId,
      type: 'review-garage-response-posted',
    });
  }

  getGaragePhoto(
    garageId: string,
    photoId: string,
    principal?: Principal,
  ): GaragePhoto | undefined {
    const photo = this.garagePhotos.get(photoId);
    if (!photo || photo.garageId !== garageId) return undefined;
    const garage = this.requireGarage(garageId);
    if (principal) {
      this.requireGarageAccess(principal, garageId);
      return photo;
    }
    if (garage.publicationState !== 'published' || photo.visibility !== 'approved')
      return undefined;
    return photo;
  }

  issueDownloadGrant(principal: Principal, fileId: string): FileGrant {
    const garageDocument = this.garageDocuments.get(fileId);
    if (garageDocument) {
      this.requireGarageAccess(principal, garageDocument.garageId);
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

  listOwnedGarages(principal: Principal) {
    return [...this.garages.values()]
      .filter((garage) => this.hasGarageAccess(principal, garage.id))
      .map((garage) => ({
        id: garage.id,
        name: garage.profile.name,
        publicationState: garage.publicationState,
      }));
  }

  listPublicDuplicateCandidates(name: string, placeId: string) {
    return [...this.garages.values()]
      .filter(
        (garage) =>
          garage.publicationState === 'published' &&
          sameGarageName(garage.profile.name, name) &&
          garage.profile.placeId === placeId,
      )
      .map((garage) => this.toPublicGarage(garage));
  }

  listPublicGarages() {
    return [...this.garages.values()]
      .filter((garage) => garage.publicationState === 'published')
      .map((garage) => this.toPublicGarage(garage));
  }

  listPublicGarageIds(): readonly string[] {
    return this.listPublicGarages().map((garage) => garage.id);
  }

  searchPublicGarages(input: PublicGarageSearchInput): PublicGarageSearchResponse {
    return findPublicGarages(
      [...this.garages.values()]
        .filter((garage) => garage.publicationState === 'published')
        .map((garage) => this.toSearchableGarage(garage)),
      input,
    );
  }

  getPublicGarageMatch(
    garageId: string,
    areas: readonly PublicGarageSearchArea[],
  ): PublicGarageSearchResult | undefined {
    const garage = this.garages.get(garageId);
    if (!garage || garage.publicationState !== 'published') return undefined;
    return findPublicGarages([this.toSearchableGarage(garage)], {
      areas,
      page: 1,
      pageSize: 1,
      sort: 'recommended',
    }).results[0];
  }

  listVehicles(userId: string) {
    return [...this.vehicles.values()]
      .filter((vehicle) => vehicle.ownerUserId === userId)
      .map(({ id, label }) => ({ id, label }));
  }

  publishGaragePhoto(admin: Principal, garageId: string, photoId: string, approved: boolean) {
    this.requireAdmin(admin);
    const photo = this.garagePhotos.get(photoId);
    if (!photo || photo.garageId !== garageId) throw new AccessError(404, 'Garage photo not found');
    photo.visibility = approved ? 'approved' : 'rejected';
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: photoId,
      type: approved ? 'garage-photo-approved' : 'garage-photo-rejected',
    });
  }

  registerGaragePhoto(
    principal: Principal,
    garageId: string,
    normalized: Omit<GaragePhoto, 'id' | 'uploadedByUserId' | 'visibility' | 'garageId'>,
  ) {
    this.requireGarageAccess(principal, garageId);
    const id = randomUUID();
    this.garagePhotos.set(id, {
      ...normalized,
      id,
      uploadedByUserId: principal.userId,
      visibility: 'pending_review',
      garageId,
    });
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: id,
      type: 'garage-photo-uploaded',
    });
    return { id, ...normalized };
  }

  requireGarageMembership(principal: Principal, garageId: string) {
    this.requireGarageAccess(principal, garageId);
  }

  revokeSession(sessionId: string | undefined) {
    if (sessionId) this.sessions.delete(sessionId);
  }

  revokeUserSessions(userId: string) {
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(sessionId);
    }
  }

  reviewGarage(
    admin: Principal,
    garageId: string,
    decision: 'published' | 'rejected' | 'suspended',
    verification: VerificationChecklist,
  ) {
    this.requireAdmin(admin);
    const garage = this.requireGarage(garageId);
    const validDecisions: Readonly<Record<GaragePublicationState, readonly string[]>> = {
      draft: [],
      pending_review: ['published', 'rejected'],
      published: ['suspended'],
      rejected: [],
      suspended: [],
    };
    if (!validDecisions[garage.publicationState].includes(decision)) {
      throw new AccessError(409, 'This garage state cannot take the requested decision');
    }
    garage.publicationState = decision;
    garage.verification = verification;
    this.auditEvents.push({
      actorUserId: admin.userId,
      subjectId: garageId,
      type: `garage-${decision}`,
    });
  }

  submitGarageForReview(principal: Principal, garageId: string) {
    this.requireGarageAccess(principal, garageId);
    const garage = this.requireGarage(garageId);
    if (!['draft', 'rejected'].includes(garage.publicationState)) {
      throw new AccessError(409, 'Only a draft or rejected garage can be submitted for review');
    }
    if (!validGarageProfile(garage.profile, garage.profile))
      throw new AccessError(422, 'Invalid garage profile');
    garage.publicationState = 'pending_review';
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: garageId,
      type: 'garage-submitted',
    });
  }

  updateGarageProfile(principal: Principal, garageId: string, profile: GarageProfileInput) {
    this.requireGarageAccess(principal, garageId);
    const garage = this.requireGarage(garageId);
    if (garage.publicationState === 'suspended') {
      throw new AccessError(409, 'A suspended garage cannot be changed through self-service');
    }
    if (!validGarageProfile(profile, garage.profile))
      throw new AccessError(422, 'Invalid garage profile');
    const locationChanged =
      garage.profile.placeId !== profile.placeId ||
      JSON.stringify(garage.profile.address) !== JSON.stringify(profile.address) ||
      !sameLocationPoint(garage.profile.locationPoint, profile.locationPoint);
    garage.profile = this.copyProfile(profile);
    if (locationChanged) {
      garage.verification = { ...garage.verification, location: 'not_checked' };
    }
    if (garage.publicationState === 'pending_review') garage.publicationState = 'draft';
    this.auditEvents.push({
      actorUserId: principal.userId,
      subjectId: garageId,
      type: 'garage-profile-updated',
    });
  }

  private canAppeal(principal: Principal, record: ModerationCaseRecord): boolean {
    if (record.report?.reporterUserId === principal.userId) return true;
    if (record.subjectType === 'review') {
      return this.reviews.get(record.subjectId)?.authorUserId === principal.userId;
    }
    if (record.subjectType === 'garage_profile') {
      return this.hasGarageAccess(principal, record.subjectId);
    }
    return false;
  }

  private changeSubjectVisibility(
    subjectType: ModerationSubjectType,
    subjectId: string,
    action: 'temporarily_hide' | 'restore',
  ): void {
    if (subjectType === 'review') {
      const review = this.requireReview(subjectId);
      const expectedState = action === 'temporarily_hide' ? 'published' : 'temporarily_hidden';
      if (review.publicationState !== expectedState) {
        throw new AccessError(409, 'This review cannot take the requested visibility action');
      }
      review.publicationState = action === 'temporarily_hide' ? 'temporarily_hidden' : 'published';
      return;
    }
    const garage = this.requireGarage(subjectId);
    const expectedState = action === 'temporarily_hide' ? 'published' : 'suspended';
    if (garage.publicationState !== expectedState) {
      throw new AccessError(409, 'This garage cannot take the requested visibility action');
    }
    garage.publicationState = action === 'temporarily_hide' ? 'suspended' : 'published';
  }

  private requireCaseAccess(principal: Principal, record: ModerationCaseRecord): void {
    if (principal.roles.has('admin')) return;
    if (principal.roles.has('moderator') && record.assignedModeratorUserId === principal.userId)
      return;
    throw new AccessError(403, 'Moderator access denied for this case');
  }

  private requireModerationCase(caseId: string): ModerationCaseRecord {
    const record = this.moderationCases.get(caseId);
    if (!record) throw new AccessError(404, 'Moderation case not found');
    return record;
  }

  private requireReportableSubject(subjectType: ModerationSubjectType, subjectId: string): void {
    if (subjectType === 'review') {
      const review = this.reviews.get(subjectId);
      if (!review || review.publicationState !== 'published') {
        throw new AccessError(404, 'Published review not found');
      }
      return;
    }
    const garage = this.garages.get(subjectId);
    if (!garage || garage.publicationState !== 'published') {
      throw new AccessError(404, 'Published garage not found');
    }
  }

  private toModerationCaseDetail(record: ModerationCaseRecord): ModerationCaseDetail {
    return {
      ...this.toModerationCaseSummary(record),
      createdAt: record.createdAt,
      ...(record.report
        ? {
            report: {
              category: record.report.category,
              ...(record.report.details ? { details: record.report.details } : {}),
              reporterUserId: record.report.reporterUserId,
            },
          }
        : {}),
    };
  }

  private toModerationCaseSummary(record: ModerationCaseRecord): ModerationCaseSummary {
    return {
      ...(record.assignedModeratorUserId
        ? { assignedModeratorUserId: record.assignedModeratorUserId }
        : {}),
      id: record.id,
      priority: record.priority,
      ...(record.reasonCode ? { reasonCode: record.reasonCode } : {}),
      status: record.status,
      subjectId: record.subjectId,
      subjectType: record.subjectType,
    };
  }

  private toSortedModerationQueue(
    records: readonly ModerationCaseRecord[],
  ): readonly ModerationCaseSummary[] {
    return [...records]
      .sort(
        (left, right) =>
          Number(right.priority === 'high') - Number(left.priority === 'high') ||
          left.createdAt.localeCompare(right.createdAt),
      )
      .map((record) => this.toModerationCaseSummary(record));
  }

  private pendingSubjectQueue(moderatorUserId?: string): readonly ModerationCaseSummary[] {
    const reviews = [...this.reviews.values()]
      .filter(
        (review) =>
          ['submitted', 'under_review'].includes(review.publicationState) &&
          (!moderatorUserId || review.moderationAssignmentUserId === moderatorUserId),
      )
      .map((review) => ({
        ...(review.moderationAssignmentUserId
          ? { assignedModeratorUserId: review.moderationAssignmentUserId }
          : {}),
        id: `review:${review.id}`,
        priority: 'normal' as const,
        status:
          review.publicationState === 'under_review'
            ? ('assigned' as const)
            : ('submitted' as const),
        subjectId: review.id,
        subjectType: 'review' as const,
      }));
    if (moderatorUserId) return reviews;
    const garages = [...this.garages.values()]
      .filter((garage) => garage.publicationState === 'pending_review')
      .map((garage) => ({
        id: `garage:${garage.id}`,
        priority: 'normal' as const,
        status: 'submitted' as const,
        subjectId: garage.id,
        subjectType: 'garage_profile' as const,
      }));
    return [...reviews, ...garages];
  }

  private toSortedModerationSummaries(
    summaries: readonly ModerationCaseSummary[],
  ): readonly ModerationCaseSummary[] {
    return [...summaries].sort(
      (left, right) =>
        Number(right.priority === 'high') - Number(left.priority === 'high') ||
        left.id.localeCompare(right.id),
    );
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
      active: request.active,
      revision: request.revision,
      updatedAt: request.updatedAt,
      areas: structuredClone(request.input.areas),
      attachmentIds: [...(request.input.attachmentIds ?? [])],
      createdAt: request.createdAt,
      earliestDropoffOn: request.input.earliestDropoffOn,
      id: request.id,
      latestPickupOn: request.input.latestPickupOn,
      serviceCategoryId: request.input.serviceCategoryId,
      symptom: request.input.symptom,
      vehicle: structuredClone(request.input.vehicle),
    };
  }

  private getPublicReviewSummary(garageId: string): PublicReviewSummary {
    const reviews = this.listPublicReviews(garageId);
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
      garageId: review.garageId,
    };
  }

  private toPublicReview(review: ReviewRecord): PublicGarageReview {
    return {
      evidence: { label: 'Besuch belegt', state: 'verified' },
      id: review.id,
      ratings: { ...review.ratings, overall: calculateOverallRating(review.ratings) },
      serviceCategoryId: review.serviceCategoryId,
      text: review.text,
      updates: review.updates.map(({ createdAt, kind, text }) => ({ createdAt, kind, text })),
      ...(review.vehicleMakeId ? { vehicleMakeId: review.vehicleMakeId } : {}),
      visitMonth: review.visitMonth,
      ...(review.garageResponse
        ? {
            garageResponse: {
              createdAt: review.garageResponse.createdAt,
              text: review.garageResponse.text,
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
      typeof checklist.garageMatches !== 'boolean'
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
      !input.garageId ||
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

  private createGarage(userId: string, profile: GarageProfileInput, consent: GarageConsent) {
    if (!consent.version || consent.version.length > 80) {
      throw new AccessError(422, 'A current onboarding consent version is required');
    }
    this.validateProfile(profile);
    const duplicateCandidates = this.listPublicDuplicateCandidates(profile.name, profile.placeId);
    const privateDuplicateExists = [...this.garages.values()].some(
      (garage) =>
        garage.publicationState !== 'published' &&
        sameGarageName(garage.profile.name, profile.name) &&
        garage.profile.placeId === profile.placeId,
    );
    if (duplicateCandidates.length > 0 || privateDuplicateExists) {
      throw new DuplicateGarageError(duplicateCandidates);
    }
    const id = randomUUID();
    const garage: Garage = {
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
    this.garages.set(id, garage);
    this.addMembership(userId, id, 'owner');
    this.auditEvents.push({
      actorUserId: userId,
      subjectId: id,
      type: 'garage-registration-started',
    });
    return garage;
  }

  private copyProfile(profile: GarageProfileInput): GarageProfileInput {
    return {
      ...profile,
      languages: [...profile.languages],
      ...(profile.locationPoint ? { locationPoint: { ...profile.locationPoint } } : {}),
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

  private hasGarageAccess(principal: Principal, garageId: string) {
    if (principal.roles.has('admin')) return this.garages.has(garageId);
    const membership = this.memberships.get(`${principal.userId}:${garageId}`);
    return membership?.state === 'active' && ['editor', 'owner'].includes(membership.role);
  }

  private requireAdmin(principal: Principal) {
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
  }

  private requireGarage(garageId: string) {
    const garage = this.garages.get(garageId);
    if (!garage) throw new AccessError(404, 'Garage not found');
    return garage;
  }

  private requireGarageAccess(principal: Principal, garageId: string) {
    if (!this.hasGarageAccess(principal, garageId)) {
      throw new AccessError(403, 'Garage access denied');
    }
  }

  private toPublicGarage(garage: Garage): PublicGarageProfile {
    const allCompanyDataVerified = Object.values(garage.verification).every(
      (state) => state === 'verified',
    );
    return {
      contact: garage.profile.publicPhone
        ? {
            phone: garage.profile.publicPhone,
            ...(garage.profile.publicWhatsapp ? { whatsapp: true } : {}),
          }
        : {},
      description: garage.profile.description,
      id: garage.id,
      languages: [...garage.profile.languages],
      name: garage.profile.name,
      photoIds: [...this.garagePhotos.values()]
        .filter((photo) => photo.garageId === garage.id && photo.visibility === 'approved')
        .map((photo) => photo.id),
      placeId: garage.profile.placeId,
      reviewSummary: this.getPublicReviewSummary(garage.id),
      selfReportedSpecializations: [...garage.profile.selfReportedSpecializations],
      serviceCategoryIds: [...garage.profile.serviceCategoryIds],
      vehicleMakeIds: [...garage.profile.vehicleMakeIds],
      ...(allCompanyDataVerified ? { verificationLabel: 'Unternehmensdaten geprüft' } : {}),
    };
  }

  private toSearchableGarage(garage: Garage): PublicGarageProfile {
    const publicProfile = this.toPublicGarage(garage);
    return garage.verification.location === 'verified' && garage.profile.locationPoint
      ? { ...publicProfile, locationPoint: { ...garage.profile.locationPoint } }
      : publicProfile;
  }

  private validateProfile(profile: GarageProfileInput) {
    if (!validGarageProfile(profile)) {
      throw new AccessError(422, 'Garage address or catalog selection is invalid');
    }
    const requiredValues = [
      profile.name,
      profile.placeId,
      profile.contactPerson,
      profile.contactPhone,
    ];
    if (requiredValues.some((value) => !value.trim())) {
      throw new AccessError(422, 'Garage name, location and verified contact fields are required');
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
    if (profile.locationPoint) {
      const { latitude, longitude } = profile.locationPoint;
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new AccessError(422, 'Garage location coordinates are invalid');
      }
    }
  }
}

function sameLocationPoint(
  left: GarageLocationPoint | undefined,
  right: GarageLocationPoint | undefined,
): boolean {
  return left?.latitude === right?.latitude && left?.longitude === right?.longitude;
}

function sameGarageName(left: string, right: string) {
  return left.trim().toLocaleLowerCase('de-DE') === right.trim().toLocaleLowerCase('de-DE');
}
