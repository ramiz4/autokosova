import { LOCAL_DEMO_PHOTOS } from '../shared/local-demo';
import type pg from 'pg';
import type { StaffCaseDetail, StaffCaseSummary } from '../shared/moderation';

interface Subject {
  readonly id: string;
  readonly subject_type: StaffCaseSummary['subjectType'];
  readonly subject_id: string;
}
interface Content {
  readonly review?: StaffCaseDetail['review'];
  readonly garage?: StaffCaseDetail['garage'];
  readonly evidenceAvailable: boolean;
  readonly restorable: boolean;
  readonly subjectState?: string;
}

/** CASE-1 / REVIEW-1: call only in the transaction of an already authorized, locked case. */
export async function readStaffCaseContent(
  client: pg.PoolClient,
  subject: Subject,
): Promise<Content> {
  if (subject.subject_type === 'review') {
    const result = await client.query<{
      review_text: string;
      visit_month: string;
      service_category_id: string;
      garage_id: string;
      garage_name: string | null;
      publication_state: string;
      verification_state: string | null;
      evidence_kind: string | null;
      work_quality: number;
      communication: number;
      price_transparency: number;
      punctuality: number;
      evidence_available: boolean;
      restorable: boolean;
    }>(
      `SELECT r.review_text,to_char(r.visit_month,'YYYY-MM') AS visit_month,r.service_category_id,
         r.garage_id,g.name AS garage_name,r.publication_state,e.verification_state,e.evidence_kind,
         r.work_quality,r.communication,r.price_transparency,r.punctuality,
         COALESCE(f.scan_state='clean' AND f.retention_state='active',false) AS evidence_available,
         COALESCE(r.publication_state='temporarily_hidden' AND r.moderation_hidden_case_id=$2
           AND r.published_at IS NOT NULL AND ((e.verification_state='verified'
             AND e.garage_matches AND e.service_matches AND e.visit_month_matches
             AND f.scan_state='clean' AND f.retention_state='active')
             OR e.verification_state='deleted_after_retention'),false) AS restorable
       FROM garage_review r LEFT JOIN visit_evidence e ON e.review_id=r.id
       LEFT JOIN file_object f ON f.id=e.private_file_id
       LEFT JOIN public_garage_profile g ON g.id=r.garage_id WHERE r.id=$1`,
      [subject.subject_id, subject.id],
    );
    const r = result.rows[0];
    if (!r) return { evidenceAvailable: false, restorable: false };
    const response = await client.query<{ response_text: string; created_at: Date }>(
      'SELECT response_text,created_at FROM review_garage_response WHERE review_id=$1',
      [subject.subject_id],
    );
    const updates = await client.query<{
      update_text: string;
      update_kind: string;
      created_at: Date;
    }>(
      'SELECT update_text,update_kind,created_at FROM review_update WHERE review_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',
      [subject.subject_id],
    );
    return {
      evidenceAvailable: r.evidence_available,
      restorable: r.restorable,
      subjectState: r.publication_state,
      review: {
        text: r.review_text,
        visitMonth: r.visit_month,
        serviceCategoryId: r.service_category_id,
        garageId: r.garage_id,
        garageName: r.garage_name ?? '',
        publicationState: r.publication_state,
        evidenceStatus: r.verification_state ?? 'unavailable',
        evidenceKind: r.evidence_kind ?? 'unavailable',
        ratings: {
          workQuality: r.work_quality,
          communication: r.communication,
          priceTransparency: r.price_transparency,
          punctuality: r.punctuality,
        },
        ...(response.rows[0]
          ? {
              garageResponse: {
                text: response.rows[0].response_text,
                createdAt: response.rows[0].created_at.toISOString(),
              },
            }
          : {}),
        updates: updates.rows.reverse().map((u) => ({
          text: u.update_text,
          kind: u.update_kind,
          createdAt: u.created_at.toISOString(),
        })),
      },
    };
  }
  if (subject.subject_type === 'garage_profile') {
    const result = await client.query<{
      name: string;
      place_id: string;
      description: string | null;
      publication_state: string;
      restorable: boolean;
    }>(
      `SELECT g.name,g.place_id,g.description,g.publication_state,
       (g.publication_state='suspended' AND g.moderation_hidden_case_id=$2 AND EXISTS (
         SELECT 1 FROM garage_verification v WHERE v.garage_id=g.id AND v.phone_state='verified'
           AND v.contact_person_state='verified' AND v.company_document_state='verified'
           AND v.location_state='verified')) AS restorable
       FROM garage g WHERE g.id=$1 AND g.deleted_at IS NULL`,
      [subject.subject_id, subject.id],
    );
    const g = result.rows[0];
    return {
      evidenceAvailable: false,
      restorable: g?.restorable ?? false,
      ...(g
        ? {
            subjectState: g.publication_state,
            garage: {
              name: g.name,
              placeId: g.place_id,
              publicationState: g.publication_state,
              photoUrls:
                g.publication_state === 'published' && subject.subject_id.startsWith('demo-')
                  ? LOCAL_DEMO_PHOTOS.map(
                      (photo) =>
                        `/api/public/garages/${encodeURIComponent(subject.subject_id)}/photos/${photo.id}`,
                    )
                  : [],
              ...(g.description ? { description: g.description } : {}),
            },
          }
        : {}),
    };
  }
  return { evidenceAvailable: false, restorable: false };
}
