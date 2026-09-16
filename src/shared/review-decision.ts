export const REVIEW_REJECTION_REASONS = [
  'duplicate_visit',
  'evidence_not_sufficient',
  'content_not_publishable',
  'other_policy',
] as const;

export type ReviewRejectionReason = (typeof REVIEW_REJECTION_REASONS)[number];

export interface EvidenceVerificationChecklist {
  readonly serviceMatches: boolean;
  readonly visitMonthMatches: boolean;
  readonly garageMatches: boolean;
}

export interface ReviewDecisionInput {
  readonly checklist: EvidenceVerificationChecklist;
  readonly decision: 'published' | 'rejected';
  readonly rejectionReason?: ReviewRejectionReason;
  /** Required by the staff workspace; legacy domain callers retain their state checks. */
  readonly caseRevision?: number;
}
