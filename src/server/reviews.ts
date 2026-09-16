import type { FileGrant, Principal } from './access';
import type {
  OwnReview,
  OwnReviewDetail,
  OwnReviewPage,
  PublicGarageReview,
  PublicReviewPage,
  ReviewDecisionInput,
  ReviewPublicFilter,
  ReviewSubmissionInput,
  ReviewUpdateKind,
} from '../shared/reviews';
export * from '../shared/reviews';

export interface ReviewStore {
  close?(): Promise<void>;
  listOwnReviewPage?(principal: Principal, page: number): Promise<OwnReviewPage> | OwnReviewPage;
  getOwnReview?(principal: Principal, reviewId: string): Promise<OwnReviewDetail> | OwnReviewDetail;
  listPublicReviewPage?(
    garageId: string,
    filter: ReviewPublicFilter,
  ): Promise<PublicReviewPage> | PublicReviewPage;
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
    requestId?: string,
    responseRevision?: number,
  ): Promise<void> | void;
  postReviewUpdate(
    principal: Principal,
    reviewId: string,
    kind: ReviewUpdateKind,
    text: string,
    requestId?: string,
  ): Promise<void> | void;
  registerPrivateFile?(
    ownerUserId: string,
    fileId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<void> | void;
}
