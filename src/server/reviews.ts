import type { FileGrant, Principal } from './access';
import {
  REVIEW_REJECTION_REASONS,
  type ReviewDecisionInput,
  type ReviewRejectionReason,
} from '../shared/review-decision';
export {
  REVIEW_REJECTION_REASONS,
  type EvidenceVerificationChecklist,
  type ReviewDecisionInput,
  type ReviewRejectionReason,
} from '../shared/review-decision';

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

export interface ReviewStore {
  close?(): Promise<void>;
  assignModerator(
    admin: Principal,
    reviewId: string,
    moderatorUserId: string,
  ): Promise<void> | void;
  createReview(principal: Principal, input: ReviewSubmissionInput): Promise<OwnReview> | OwnReview;
  decideReview(
    principal: Principal,
    reviewId: string,
    decision: ReviewDecisionInput,
  ): Promise<void> | void;
  deleteEvidenceAfterRetention(
    admin: Principal,
    reviewId: string,
  ): Promise<string | void> | string | void;
  issueEvidenceDownloadGrant(
    principal: Principal,
    reviewId: string,
  ): Promise<FileGrant> | FileGrant;
  listOwnReviews(principal: Principal): Promise<readonly OwnReview[]> | readonly OwnReview[];
  listPublicReviews(
    garageId: string,
    filter?: ReviewPublicFilter,
  ): Promise<readonly PublicGarageReview[]> | readonly PublicGarageReview[];
  postGarageResponse(
    principal: Principal,
    garageId: string,
    reviewId: string,
    text: string,
  ): Promise<void> | void;
  postReviewUpdate(
    principal: Principal,
    reviewId: string,
    kind: ReviewUpdateKind,
    text: string,
  ): Promise<void> | void;
  registerPrivateFile?(
    ownerUserId: string,
    fileId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<void> | void;
}

export interface ReviewPublicFilter {
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
