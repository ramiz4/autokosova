import { REPAIR_REQUEST_SERVICE_CATEGORIES, REPAIR_REQUEST_VEHICLE_MAKES } from './repair-request';
import { REVIEW_REJECTION_REASONS, type ReviewRejectionReason } from './review-decision';
export {
  REVIEW_REJECTION_REASONS,
  type EvidenceVerificationChecklist,
  type ReviewDecisionInput,
  type ReviewRejectionReason,
} from './review-decision';

export const REVIEW_LIMITS = {
  maxResponseLength: 1_200,
  maxTextLength: 2_000,
  maxUpdateLength: 1_200,
  minTextLength: 20,
} as const;

export const REVIEW_EVIDENCE_KINDS = [
  'invoice',
  'work_order',
  'payment_confirmation',
  'garage_confirmation',
  'other_service_proof',
] as const;

export type ReviewEvidenceKind = (typeof REVIEW_EVIDENCE_KINDS)[number];
export type ReviewEvidenceStatus =
  'submitted' | 'under_review' | 'verified' | 'not_verified' | 'deleted_after_retention';
export type ReviewPublicationState =
  'submitted' | 'under_review' | 'published' | 'temporarily_hidden' | 'rejected' | 'withdrawn';
export type ReviewUpdateKind = 'complaint' | 'rework';

export interface ReviewRatings {
  readonly communication: number;
  readonly priceTransparency: number;
  readonly punctuality: number;
  readonly workQuality: number;
}

export interface ReviewSubmissionInput extends ReviewRatings {
  readonly evidenceFileId: string;
  readonly evidenceKind: ReviewEvidenceKind;
  readonly serviceCategoryId: string;
  readonly text: string;
  readonly vehicleMakeId?: string;
  /** Calendar month in which the work was performed; deliberately no travel dates. */
  readonly visitMonth: string;
  readonly garageId: string;
}

export interface PublicReviewSummary {
  readonly averageRating?: number;
  readonly label: string;
  readonly latestVisitMonth?: string;
  readonly reviewCount: number;
  readonly state: 'available' | 'unavailable';
  readonly verifiedVisitCount: number;
}

export interface PublicGarageReview {
  readonly evidence: {
    readonly label: 'Besuch belegt';
    readonly state: 'verified';
  };
  readonly id: string;
  readonly ratings: ReviewRatings & { readonly overall: number };
  readonly serviceCategoryId: string;
  readonly text: string;
  readonly updates: readonly {
    readonly createdAt: string;
    readonly kind: ReviewUpdateKind;
    readonly text: string;
  }[];
  readonly vehicleMakeId?: string;
  readonly visitMonth: string;
  readonly garageResponse?: {
    readonly revision?: number;
    readonly updatedAt?: string;
    readonly createdAt: string;
    readonly text: string;
  };
}

export interface OwnReview {
  readonly evidenceStatus: ReviewEvidenceStatus;
  readonly id: string;
  readonly publicationState: ReviewPublicationState;
  readonly rejectionReason?: ReviewRejectionReason;
  readonly ratings: ReviewRatings & { readonly overall: number };
  readonly serviceCategoryId: string;
  readonly visitMonth: string;
  readonly garageId: string;
}

export interface ReviewPublicFilter {
  readonly page?: number;
  readonly serviceCategoryId?: string;
  readonly vehicleMakeId?: string;
}

export function calculateOverallRating(ratings: ReviewRatings): number {
  return (
    Math.round(
      ((ratings.workQuality +
        ratings.communication +
        ratings.priceTransparency +
        ratings.punctuality) /
        4) *
        10,
    ) / 10
  );
}

export function emptyReviewSummary(): PublicReviewSummary {
  return {
    label: 'Noch keine Bewertungen',
    reviewCount: 0,
    state: 'unavailable',
    verifiedVisitCount: 0,
  };
}

export function reviewSummaryLabel(reviewCount: number, averageRating: number): string {
  const countLabel = reviewCount === 1 ? 'Bewertung' : 'Bewertungen';
  return `${averageRating.toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} von 5 · ${reviewCount} ${countLabel}`;
}

/**
 * Reviews can make a published experience discoverable, but never dominate the proven search
 * criteria. One lone five-star review has no ranking effect; a broader verified basis earns only
 * a small, capped tie-breaker. Payment, garage confirmation and response text are absent.
 */
export function reviewRelevanceScore(summary: PublicReviewSummary): number {
  if (summary.state !== 'available' || !summary.averageRating || summary.reviewCount < 2) return 0;
  const evidenceBase = Math.min(summary.verifiedVisitCount, 4);
  if (evidenceBase < 2) return 0;
  const ratingBand = summary.averageRating >= 4.5 ? 2 : summary.averageRating >= 4 ? 1 : 0;
  return Math.min(4, evidenceBase - 1 + ratingBand);
}

export function isReviewEvidenceKind(value: unknown): value is ReviewEvidenceKind {
  return typeof value === 'string' && REVIEW_EVIDENCE_KINDS.includes(value as ReviewEvidenceKind);
}

export function isReviewRejectionReason(value: unknown): value is ReviewRejectionReason {
  return (
    typeof value === 'string' && REVIEW_REJECTION_REASONS.includes(value as ReviewRejectionReason)
  );
}

export function isReviewUpdateKind(value: unknown): value is ReviewUpdateKind {
  return value === 'complaint' || value === 'rework';
}

export function isVisitMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Private projection for an author's own workflow, never used for public review responses. */
export interface OwnReviewDetail extends OwnReview {
  readonly text: string;
  readonly garageName: string;
  readonly evidenceKind: ReviewEvidenceKind;
  readonly evidenceFileId?: string;
  readonly vehicleMakeId?: string;
  readonly submittedAt: string;
  readonly caseStatus?: string;
  readonly caseReason?: string;
  readonly updates: PublicGarageReview['updates'];
}
export interface OwnReviewPage {
  readonly reviews: readonly OwnReviewDetail[];
  readonly page: number;
  readonly hasMore: boolean;
}
export interface PublicReviewPage {
  readonly reviews: readonly PublicGarageReview[];
  readonly page: number;
  readonly hasMore: boolean;
}
export const REVIEW_PAGE_SIZE = 10;
export const REVIEW_RATING_FIELDS = [
  'workQuality',
  'communication',
  'priceTransparency',
  'punctuality',
] as const;
/** A calendar month is not a travel date. Reject impossible/future values before persistence. */
export function isAllowedVisitMonth(value: unknown, now = new Date()): value is string {
  return (
    typeof value === 'string' &&
    isVisitMonth(value) &&
    value >= '1900-01' &&
    value <= now.toISOString().slice(0, 7)
  );
}
export function validReviewSubmission(input: ReviewSubmissionInput, now = new Date()): boolean {
  return (
    !!input &&
    typeof input.garageId === 'string' &&
    input.garageId.length > 0 &&
    typeof input.evidenceFileId === 'string' &&
    input.evidenceFileId.length > 0 &&
    isReviewEvidenceKind(input.evidenceKind) &&
    isAllowedVisitMonth(input.visitMonth, now) &&
    REPAIR_REQUEST_SERVICE_CATEGORIES.some((id) => id === input.serviceCategoryId) &&
    (input.vehicleMakeId === undefined ||
      REPAIR_REQUEST_VEHICLE_MAKES.some((id) => id === input.vehicleMakeId)) &&
    typeof input.text === 'string' &&
    input.text.trim().length >= REVIEW_LIMITS.minTextLength &&
    input.text.trim().length <= REVIEW_LIMITS.maxTextLength &&
    REVIEW_RATING_FIELDS.every(
      (field) => Number.isInteger(input[field]) && input[field] >= 1 && input[field] <= 5,
    )
  );
}
