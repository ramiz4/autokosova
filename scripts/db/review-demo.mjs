import {
  staffDemoGarage,
  staffDemoOperator,
  staffDemoFixtures,
} from '../../db/staff-demo-data.mjs';

/** Extend the single workflow seed after its already validated customer/issuer binding. */
export async function seedReviewWorkflowDemo(client, config) {
  if (!config) return;
  const binding = await client.query(
    "SELECT 1 FROM local_demo_account_binding WHERE account_type='customer' AND user_id=$1 AND oidc_issuer=$2",
    [config.customer, config.issuer],
  );
  if (!binding.rowCount)
    throw new Error('Review demo requires the existing validated customer binding.');
  const ready = await client.query(
    "SELECT 1 FROM garage g JOIN app_user u ON u.id=$2 WHERE g.id=$1 AND g.deleted_at IS NULL AND u.status='active'",
    [staffDemoGarage, config.customer],
  );
  if (!ready.rowCount) return;
  for (const state of ['pending', 'published']) {
    const id = 'demo-customer-review-' + state,
      file = id + '-file';
    const known = await client.query(
      "SELECT 1 FROM local_demo_seed_entity WHERE entity_type='garage_review' AND entity_id=$1",
      [id],
    );
    if (known.rowCount) continue; // Includes tombstones: no resurrection, reset or re-assignment.
    const collision = await client.query(
      'SELECT 1 FROM garage_review WHERE id=$1 UNION ALL SELECT 1 FROM file_object WHERE id=$2',
      [id, file],
    );
    if (collision.rowCount)
      throw new Error('Review demo ID is already occupied by unmanaged data.');
    await client.query(
      "INSERT INTO file_object(id,owner_user_id,storage_key,content_type,size_bytes,scan_state,retention_state) VALUES($1,$2,$3,'text/plain',$4,'clean','active')",
      [
        file,
        config.customer,
        'local-demo/' + file,
        Buffer.byteLength(staffDemoFixtures['visit-valid']),
      ],
    );
    await client.query(
      "INSERT INTO local_demo_file_fixture(file_id,fixture_key) VALUES($1,'visit-valid')",
      [file],
    );
    await client.query(
      `INSERT INTO garage_review(id,author_user_id,garage_id,service_category_id,visit_month,work_quality,communication,price_transparency,punctuality,review_text,publication_state,submitted_at)
      VALUES($1,$2,$3,'bremsen','2026-08-01',2,3,2,3,$4,'submitted','2026-09-03T10:00:00Z')`,
      [
        id,
        config.customer,
        staffDemoGarage,
        state === 'pending'
          ? 'DEMO – Eigene eingereichte Bewertung: Die Arbeit war nachvollziehbar, die Kommunikation war unzureichend.'
          : 'DEMO – Eigene veröffentlichte Bewertung: Fiktive Erfahrung für ein öffentliches Reklamations- oder Nacharbeitsupdate.',
      ],
    );
    await client.query(
      "INSERT INTO visit_evidence(id,review_id,owner_user_id,private_file_id,evidence_kind,verification_state) VALUES($1,$2,$3,$4,'invoice','submitted')",
      [id + '-evidence', id, config.customer, file],
    );
    if (state === 'published') {
      await client.query(
        "UPDATE visit_evidence SET verification_state='verified',garage_matches=true,service_matches=true,visit_month_matches=true,reviewed_by_user_id=$2,reviewed_at='2026-09-04T10:00:00Z' WHERE review_id=$1",
        [id, staffDemoOperator],
      );
      await client.query(
        "UPDATE garage_review SET publication_state='published',published_at='2026-09-04T10:00:00Z' WHERE id=$1",
        [id],
      );
      await client.query(
        "UPDATE moderation_case SET decided_by_user_id=$2,reason_code='no_violation' WHERE id=$1",
        ['review:' + id, staffDemoOperator],
      );
      await client.query(
        "INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type,created_at) VALUES($1,$2,'review',$3,'demo-review-published','2026-09-04T10:00:00Z')",
        [id + '-event', staffDemoOperator, id],
      );
    }
    for (const [type, key] of [
      ['garage_review', id],
      ['file_object', file],
    ])
      await client.query(
        'INSERT INTO local_demo_seed_entity(entity_type,entity_id,seed_version) VALUES($1,$2,$3)',
        [type, key, 'demo-workflows'],
      );
  }
}
