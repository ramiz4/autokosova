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
    await seedModerationScenario(client, scenario, config);
    await mark(client, 'garage_review', scenario.id);
    await mark(client, 'visit_evidence', scenario.id + '-evidence');
    await mark(client, 'file_object', fileId);
  }
  if (config.moderator) await seedProfileReportDemo(client, config);
}
async function mark(client, type, id) {
  await client.query(
    'INSERT INTO local_demo_seed_entity(entity_type,entity_id,seed_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [type, id, 'staff-foundation-v1'],
  );
}

// Only called for a newly created, provenance-checked synthetic review in this seed transaction.
async function seedModerationScenario(client, scenario, config) {
  const type = scenario.scenario;
  if (!type || !config.moderator) return;
  if (!scenario.id.startsWith('demo-staff-review-'))
    throw new Error('Invalid synthetic scenario ID');
  const caseId = 'review:' + scenario.id;
  if (type === 'waiting') {
    await client.query(
      "UPDATE moderation_case SET status='waiting_for_subject',reason_code='missing_information' WHERE id=$1",
      [caseId],
    );
    return;
  }
  if (type === 'appeal' || type === 'own-appeal') {
    const previous = type === 'own-appeal' ? config.moderator : staffDemoOperator;
    await client.query(
      "UPDATE garage_review SET publication_state='rejected',rejection_reason_code='evidence_not_sufficient' WHERE id=$1",
      [scenario.id],
    );
    await client.query(
      "UPDATE visit_evidence SET verification_state='not_verified' WHERE review_id=$1",
      [scenario.id],
    );
    await client.query(
      'INSERT INTO moderation_appeal(id,case_id,appellant_user_id,message) VALUES($1,$2,$3,$4)',
      [
        scenario.id + '-appeal',
        caseId,
        staffDemoAuthor,
        'DEMO – Bitte diesen fiktiven Nachweis unabhängig nochmals prüfen. Die ursprüngliche Entscheidung bleibt im Verlauf.',
      ],
    );
    await client.query(
      "UPDATE moderation_case SET status='assigned',decided_by_user_id=$2,appeal_against_user_id=$2 WHERE id=$1",
      [caseId, previous],
    );
    await client.query(
      "INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type) VALUES($1,$2,'review',$3,'review-rejected')",
      [scenario.id + '-old-decision', previous, scenario.id],
    );
    return;
  }
  await client.query(
    "UPDATE garage_review SET publication_state='published',published_at='2026-09-02T10:00:00Z' WHERE id=$1",
    [scenario.id],
  );
  await client.query(
    "UPDATE visit_evidence SET verification_state='verified',garage_matches=true,service_matches=true,visit_month_matches=true,reviewed_by_user_id=$2,reviewed_at='2026-09-02T10:00:00Z' WHERE review_id=$1",
    [scenario.id, staffDemoOperator],
  );
  const report = scenario.id + '-report';
  await client.query(
    `INSERT INTO moderation_case(id,kind,subject_type,subject_id,requester_user_id,assigned_moderator_user_id,status,priority,created_at)
    VALUES($1,'report','review',$2,$3,$4,'assigned','high','2026-09-03T10:00:00Z')`,
    [report, scenario.id, staffDemoReporter, config.moderator],
  );
  await client.query(
    "INSERT INTO content_report(case_id,reporter_user_id,category,details) VALUES($1,$2,'personal_data',$3)",
    [
      report,
      staffDemoReporter,
      'DEMO – Fiktive Meldung für die Inhaltsprüfung. Alle Angaben sind erfunden.',
    ],
  );
  if (type === 'restore' || type === 'removed') {
    await client.query(
      `UPDATE garage_review SET publication_state=$2,moderation_hidden_case_id=$3,published_at=CASE WHEN $2='withdrawn' THEN NULL ELSE published_at END WHERE id=$1`,
      [
        scenario.id,
        type === 'restore' ? 'temporarily_hidden' : 'withdrawn',
        type === 'restore' ? report : null,
      ],
    );
    await client.query(
      "UPDATE moderation_case SET status='resolved',decided_by_user_id=$2,reason_code='policy_violation' WHERE id=$1",
      [report, staffDemoOperator],
    );
  }
  await mark(client, 'moderation_case', report);
}

async function seedProfileReportDemo(client, config) {
  const id = 'demo-staff-profile-report';
  const garage = 'demo-staff-profile-subject';
  const known = await client.query(
    "SELECT 1 FROM local_demo_seed_entity WHERE entity_type='moderation_case' AND entity_id=$1",
    [id],
  );
  if (known.rowCount) return;
  const occupied = await client.query(
    'SELECT 1 FROM moderation_case WHERE id=$1 UNION ALL SELECT 1 FROM garage WHERE id=$2',
    [id, garage],
  );
  if (occupied.rowCount) throw new Error('Unmanaged staff demo scenario collision');
  await client.query(
    "INSERT INTO garage(id,name,publication_state,place_id,description) VALUES($1,'DEMO · Profilprüfung','published','xk-pristina','DEMO – Fiktiver Profiltext für die Inhaltsprüfung. Unternehmensprüfung bleibt getrennt.')",
    [garage],
  );
  await client.query(
    "INSERT INTO garage_verification(garage_id,phone_state,contact_person_state,company_document_state,location_state) VALUES($1,'verified','verified','verified','verified')",
    [garage],
  );
  await client.query(
    `INSERT INTO moderation_case(id,kind,subject_type,subject_id,requester_user_id,assigned_moderator_user_id,status,priority,created_at)
    VALUES($1,'report','garage_profile',$2,$3,$4,'assigned','normal','2026-09-04T10:00:00Z')`,
    [id, garage, staffDemoReporter, config.moderator],
  );
  await client.query(
    "INSERT INTO content_report(case_id,reporter_user_id,category,details) VALUES($1,$2,'spam_or_deception',$3)",
    [
      id,
      staffDemoReporter,
      'DEMO – Fiktive Inhaltsmeldung, keine Unternehmensnachweise und keine realen Daten.',
    ],
  );
  await mark(client, 'garage', garage);
  await mark(client, 'moderation_case', id);
}
