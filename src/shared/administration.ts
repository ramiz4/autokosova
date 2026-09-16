import type {
  GarageProfileInput,
  GaragePublicationState,
  VerificationChecklist,
} from './garage-onboarding';
import type { RetentionPolicy, DataDeletionRequest } from './moderation';

export const ADMIN_REASON_CODES = [
  'company_verified',
  'missing_information',
  'policy_violation',
  'ownership_change',
  'documented_support',
  'privacy_request',
] as const;
export type AdminReasonCode = (typeof ADMIN_REASON_CODES)[number];
export interface AdminRevision {
  readonly revision: number;
  readonly reason: AdminReasonCode;
}
export interface AdminGarageDecision extends AdminRevision {
  readonly decision: 'published' | 'rejected' | 'suspended' | 'restore';
  readonly verification: VerificationChecklist;
  readonly locationPoint?: { readonly latitude: number; readonly longitude: number };
}
export type AdminGaragePublishBlocker =
  | 'state'
  | 'moderation_hidden'
  | 'profile'
  | 'point'
  | 'company_document'
  | 'owner_account'
  | 'interest';
export interface AdminGaragePrerequisites {
  readonly publishable: boolean;
  readonly blockers: readonly AdminGaragePublishBlocker[];
}
export interface AdminGarageSummary {
  readonly id: string;
  readonly name: string;
  readonly publicationState: GaragePublicationState;
  readonly deleted: boolean;
  readonly revision: number;
  readonly ownerCount: number;
}
export interface AdminMember {
  readonly userId: string;
  readonly label: string;
  readonly role: 'owner' | 'editor';
  readonly state: 'active' | 'revoked';
}
export interface AdminGarageDetail extends AdminGarageSummary {
  readonly profile: GarageProfileInput;
  readonly verification: VerificationChecklist;
  readonly consentVersion?: string;
  readonly consentSource?: string;
  readonly adminSuspended: boolean;
  readonly lastReason?: AdminReasonCode;
  readonly members: readonly AdminMember[];
  readonly documents: readonly { readonly fileId: string; readonly available: boolean }[];
  readonly photos: readonly {
    readonly id: string;
    readonly visibility: 'pending_review' | 'approved' | 'rejected';
    readonly previewPath?: string;
  }[];
  /** Deliberately small, authorized projection for the review action. */
  readonly prerequisites: AdminGaragePrerequisites;
}
export interface AdminUser {
  readonly id: string;
  readonly label: string;
  readonly accountType: 'customer' | 'garage';
  readonly status: 'active' | 'suspended';
  readonly roles: readonly string[];
  readonly rolesVerifiedAt?: string;
  readonly memberships: readonly (AdminMember & {
    readonly garageId: string;
    readonly garageName: string;
  })[];
}
export interface AdminPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly hasMore: boolean;
}
export interface AdminOverview {
  readonly pendingGarages: number;
  readonly unassignedCases: number;
  readonly escalatedCases: number;
  readonly pendingDeletions: number;
  readonly blockedDeletions: number;
}
export interface AdminPrivacy {
  readonly requests: readonly (DataDeletionRequest & {
    readonly label: string;
    readonly activeOwnerships: number;
    readonly pendingFileDeletions: number;
  })[];
  readonly page: number;
  readonly hasMore: boolean;
  readonly policy?: RetentionPolicy;
}
export interface AdminAuditEvent {
  readonly id: string;
  readonly actor: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  readonly createdAt: string;
}
export interface AdminCatalogItem {
  readonly id: string;
  readonly label: string;
  readonly labelSq?: string;
  readonly retired: boolean;
  readonly source?: string;
  readonly license?: string;
  readonly checkedAt?: string;
}
export interface AdminCatalog {
  readonly services: readonly AdminCatalogItem[];
  readonly makes: readonly AdminCatalogItem[];
  readonly places: readonly AdminCatalogItem[];
}
export interface AdminSupportContext {
  readonly applicantUserId: string;
  readonly requestReference: string;
  readonly garageId?: string;
  readonly revision?: number;
}
export const ADMIN_PAGE_SIZE = 20;
export function validAdminRevision(value: unknown): value is AdminRevision {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(input['revision']) &&
    Number(input['revision']) > 0 &&
    ADMIN_REASON_CODES.some((reason) => reason === input['reason'])
  );
}
export function validAdminDecision(value: unknown): value is AdminGarageDecision {
  if (!validAdminRevision(value)) return false;
  const input = value as unknown as Record<string, unknown>;
  const check = input['verification'];
  return (
    Object.keys(input).every((key) =>
      ['revision', 'reason', 'decision', 'verification', 'locationPoint'].includes(key),
    ) &&
    ['published', 'rejected', 'suspended', 'restore'].includes(String(input['decision'])) &&
    !!check &&
    typeof check === 'object' &&
    Object.keys(check).length === 4 &&
    ['phone', 'contactPerson', 'companyDocument', 'location'].every((key) =>
      ['not_checked', 'verified', 'failed'].includes(
        String((check as Record<string, unknown>)[key]),
      ),
    ) &&
    validAdminLocationPoint(input['locationPoint'])
  );
}

/** Reject unknown keys as well as non-finite or out-of-range coordinates. */
export function validAdminLocationPoint(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return (
    Object.keys(point).length === 2 &&
    Object.keys(point).every((key) => key === 'latitude' || key === 'longitude') &&
    typeof point['latitude'] === 'number' &&
    typeof point['longitude'] === 'number' &&
    Number.isFinite(point['latitude']) &&
    Number.isFinite(point['longitude']) &&
    point['latitude'] >= -90 &&
    point['latitude'] <= 90 &&
    point['longitude'] >= -180 &&
    point['longitude'] <= 180
  );
}
