import {
  staffDemoAuthor,
  staffDemoReporter,
  staffDemoForeign,
  staffDemoOperator,
  staffDemoGarage,
  staffDemoReviews,
  staffDemoFixtures,
} from '../../db/staff-demo-data.mjs';

export function readStaffDemoConfig(environment = process.env) {
  if (environment.NODE_ENV === 'production')
    throw new Error('Staff demo is prohibited in production.');
  const admin = environment.AUTOKOSOVA_DEMO_ADMIN_SUBJECT?.trim();
  const moderator = environment.AUTOKOSOVA_DEMO_MODERATOR_SUBJECT?.trim();
  const roles = [
    admin,
    moderator,
    environment.AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT?.trim(),
    environment.AUTOKOSOVA_DEMO_GARAGE_SUBJECT?.trim(),
  ].filter(Boolean);
  if (
    new Set(roles).size !== roles.length ||
    roles.some((value) => value.length > 200 || /[\x00-\x20\x7f]/.test(value))
  )
    throw new Error('Demo account subjects must be valid and distinct; no value is printed.');
  return { admin, moderator };
}

/** Called only inside the existing protected, transactionally seeded local workflow profile. */
export async function seedStaffDemo(client, environment = process.env) {
  const config = readStaffDemoConfig(environment);
  const ready = await client.query('SELECT 1 FROM garage WHERE id=$1 AND deleted_at IS NULL', [
    staffDemoGarage,
  ]);
  if (!ready.rowCount) return; // Never resurrect a garage removed by the user.
  for (const userId of [staffDemoAuthor, staffDemoReporter, staffDemoForeign, staffDemoOperator]) {
    const known = await client.query(
      'SELECT 1 FROM local_demo_seed_entity WHERE entity_type=$1 AND entity_id=$2',
      ['app_user', userId],
    );
    if (known.rowCount) continue;
    const inserted = await client.query(
      "INSERT INTO app_user(id,oidc_subject,status) VALUES($1,$1,'active') ON CONFLICT DO NOTHING RETURNING id",
      [userId],
    );
    if (!inserted.rowCount)
      throw new Error('Staff demo fixture ID is already used by unmanaged data.');
    await mark(client, 'app_user', userId);
  }
  if (config.moderator) {
    // Binding a known, explicitly configured subject to a case does NOT assign a platform role.
    await client.query(
      "INSERT INTO app_user(id,oidc_subject,status) VALUES($1,$1,'active') ON CONFLICT DO NOTHING",
      [config.moderator],
    );
    const binding = await client.query(
      "SELECT subject_id FROM local_demo_staff_binding WHERE purpose='moderator'",
    );
    if (binding.rows[0] && binding.rows[0].subject_id !== config.moderator)
      throw new Error(
        'Staff demo is bound to a different subject; use a fresh isolated demo environment.',
      );
    await client.query(
      "INSERT INTO local_demo_staff_binding(purpose,subject_id) VALUES('moderator',$1) ON CONFLICT DO NOTHING",
      [config.moderator],
    );
  }
  for (const scenario of staffDemoReviews) {
    if (scenario.assignment === 'moderator' && !config.moderator) continue;
    const known = await client.query(
      'SELECT 1 FROM local_demo_seed_entity WHERE entity_type=$1 AND entity_id=$2',
      ['garage_review', scenario.id],
    );
    if (known.rowCount) continue; // Tombstones and decisions survive every later seed.
    const fileId = scenario.id + '-file';
    const fileKey = scenario.file;
    const occupied = await client.query(
      'SELECT 1 FROM garage_review WHERE id=$1 UNION ALL SELECT 1 FROM file_object WHERE id=$2',
      [scenario.id, fileId],
    );
    if (occupied.rowCount)
      throw new Error('Staff demo fixture ID is already used by unmanaged data.');
    const author = await client.query("SELECT 1 FROM app_user WHERE id=$1 AND status='active'", [
      staffDemoAuthor,
    ]);
    if (!author.rowCount) continue;
    const assignee =
      scenario.assignment === 'moderator'
        ? config.moderator
        : scenario.assignment === 'foreign'
          ? staffDemoForeign
          : null;
    await client.query(
      `INSERT INTO file_object(id,owner_user_id,storage_key,content_type,size_bytes,scan_state)
      VALUES($1,$2,$3,'text/plain',$4,$5)`,
      [
        fileId,
        staffDemoAuthor,
        'local-demo/' + fileId,
        Buffer.byteLength(staffDemoFixtures[fileKey]),
        scenario.blocked ? 'failed' : 'clean',
      ],
    );
    await client.query('INSERT INTO local_demo_file_fixture(file_id,fixture_key) VALUES($1,$2)', [
      fileId,
      fileKey,
    ]);
    await client.query(
      `INSERT INTO garage_review(id,author_user_id,garage_id,service_category_id,visit_month,
      work_quality,communication,price_transparency,punctuality,review_text,publication_state,submitted_at)
      VALUES($1,$2,$3,'bremsen','2026-08-01',2,4,3,2,$4,'submitted','2026-09-01T10:00:00Z')`,
      [
        scenario.id,
        staffDemoAuthor,
        staffDemoGarage,
        'DEMO – fiktive kritische Erfahrung: Die Bremsenarbeit wurde ausgeführt, aber Termin und Erklärung waren nicht wie erwartet.',
      ],
    );
    await client.query(
      `INSERT INTO visit_evidence(id,review_id,owner_user_id,private_file_id,evidence_kind,verification_state)
      VALUES($1,$2,$3,$4,'other_service_proof','submitted')`,
      [scenario.id + '-evidence', scenario.id, staffDemoAuthor, fileId],
    );
    if (assignee) {
      await client.query(
        'INSERT INTO review_moderator_assignment(review_id,moderator_user_id,assigned_by_user_id) VALUES($1,$2,$3)',
        [scenario.id, assignee, staffDemoOperator],
      );
      await client.query("UPDATE garage_review SET publication_state='under_review' WHERE id=$1", [
        scenario.id,
      ]);
      await client.query(
        "UPDATE visit_evidence SET verification_state='under_review' WHERE review_id=$1",
        [scenario.id],
      );
    }
    if (scenario.assignment === 'escalated')
      await client.query(
        `UPDATE moderation_case SET escalation_reason='requires_admin',escalated_at='2026-09-02T10:00:00Z',escalated_by_user_id=$2 WHERE id=$1`,
        ['review:' + scenario.id, staffDemoForeign],
      );
    await client.query(
      "INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type) VALUES($1,$2,'moderation_case',$3,'demo-case-prepared')",
      [scenario.id + '-audit', staffDemoOperator, 'review:' + scenario.id],
    );
    await mark(client, 'garage_review', scenario.id);
    await mark(client, 'visit_evidence', scenario.id + '-evidence');
    await mark(client, 'file_object', fileId);
  }
}
async function mark(client, type, id) {
  await client.query(
    'INSERT INTO local_demo_seed_entity(entity_type,entity_id,seed_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [type, id, 'staff-foundation-v1'],
  );
}
