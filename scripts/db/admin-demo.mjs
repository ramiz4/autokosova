import { staffDemoFixtures, staffDemoOperator } from '../../db/staff-demo-data.mjs';

/** Called inside the existing explicitly local workflow transaction. No provider or role writes. */
export async function seedAdminDemo(client, environment = process.env) {
  if (environment.NODE_ENV === 'production')
    throw new Error('Administrative demo is prohibited in production.');
  const actors = {
    'demo-admin-owner': 'Liridona Kelmendi',
    'demo-admin-editor': 'Gëzim Morina',
    'demo-admin-next-owner': 'Armend Hasani',
    'demo-admin-former-editor': 'Vesa Berisha',
    'demo-admin-erase-requester': 'Kushtrim Gashi',
  };
  for (const [id, displayName] of Object.entries(actors)) {
    const known = await client.query(
      "SELECT 1 FROM local_demo_seed_entity WHERE entity_type='app_user' AND entity_id=$1",
      [id],
    );
    if (known.rowCount) continue;
    const inserted = await client.query(
      "INSERT INTO app_user(id,oidc_subject,status) VALUES($1,$1,'active') ON CONFLICT DO NOTHING RETURNING id",
      [id],
    );
    if (!inserted.rowCount) throw new Error('Unmanaged administrative demo account collision');
    await mark(client, 'app_user', id);
    await client.query(
      `INSERT INTO staff_identity (user_id, display_name, verified_roles)
       VALUES ($1, $2, '{}')
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [id, displayName],
    );
  }
  const owner = await client.query(
    "SELECT 1 FROM app_user WHERE id='demo-admin-owner' AND status='active'",
  );
  if (!owner.rowCount) return;
  const scenarios = [
    {
      id: 'demo-admin-garage-pending',
      name: 'Auto-Service Pllana',
      address: 'Rruga Nënë Tereza 12, Prishtina',
      contact: 'Arbnor Pllana',
      phone: '+383 44 200 101',
      description: 'Fahrzeugreparaturen und Bremsen-Service in Prishtina. Alle Marken.',
      state: 'pending_review',
      proof: true,
    },
    {
      id: 'demo-admin-garage-incomplete',
      name: 'Werkstatt Sejdiu',
      address: 'Bulevardi Bill Clinton 8, Prishtina',
      contact: 'Muharrem Sejdiu',
      phone: '+383 44 200 102',
      description: 'Allgemeine Kfz-Werkstatt und Inspektion in Prishtina.',
      state: 'pending_review',
      proof: false,
    },
    {
      id: 'demo-admin-garage-members',
      name: 'Prishtina Auto-Centrum',
      address: 'Rruga UÇK 45, Prishtina',
      contact: 'Flamur Bajrami',
      phone: '+383 44 200 103',
      description: 'Vollservice, Elektrik und Inspektion für alle Fahrzeugmarken.',
      state: 'published',
      proof: true,
    },
    {
      id: 'demo-admin-garage-suspended',
      name: 'Karosserie Dragusha',
      address: 'Rruga Fehmi Agani 23, Prishtina',
      contact: 'Xhevdet Dragusha',
      phone: '+383 44 200 104',
      description: 'Karosserie und Lackierung in Prishtina.',
      state: 'suspended',
      proof: true,
    },
    {
      id: 'demo-admin-garage-unrestorable',
      name: 'Auto-Fix Prishtina',
      address: 'Rruga Agim Ramadani 67, Prishtina',
      contact: 'Naim Kurtishi',
      phone: '+383 44 200 105',
      description: 'Schnellreparaturen und Reifenservice in Prishtina.',
      state: 'suspended',
      proof: false,
    },
  ];
  for (const [index, item] of scenarios.entries()) {
    const known = await client.query(
      "SELECT 1 FROM local_demo_seed_entity WHERE entity_type='garage' AND entity_id=$1",
      [item.id],
    );
    if (known.rowCount) continue;
    const occupied = await client.query('SELECT 1 FROM garage WHERE id=$1', [item.id]);
    if (occupied.rowCount) throw new Error('Unmanaged administrative demo garage collision');
    await client.query(
      `INSERT INTO garage(id,name,publication_state,place_id,business_address,description,contact_person,contact_phone,languages,
      self_reported_specializations,created_by_user_id,location_point,location_source,admin_suspended)
      VALUES($1,$2,'draft','xk-pristina',$3,$4,$5,$6,ARRAY['Deutsch'],ARRAY[]::text[],
        'demo-admin-owner',ST_SetSRID(ST_MakePoint($7,42.665),4326)::geography,'operator_entered',$8)`,
      [
        item.id,
        item.name,
        item.address,
        item.description,
        item.contact,
        item.phone,
        21.15 + index * 0.001,
        item.state === 'suspended',
      ],
    );
    await client.query(
      "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES('demo-admin-owner',$1,'owner','active',$2),('demo-admin-editor',$1,'editor','active',$2),('demo-admin-former-editor',$1,'editor','revoked',$2)",
      [item.id, staffDemoOperator],
    );
    await client.query(
      "INSERT INTO garage_consent(id,garage_id,applicant_user_id,recorded_by_user_id,source,consent_version) VALUES($1,$2,'demo-admin-owner',$3,'documented_support_request','DEMO-consent-not-real')",
      [item.id + '-consent', item.id, staffDemoOperator],
    );
    await client.query(
      "INSERT INTO garage_service_category(garage_id,service_category_id) VALUES($1,'bremsen')",
      [item.id],
    );
    const checked = item.proof && (item.state === 'published' || item.state === 'suspended');
    await client.query(
      'INSERT INTO garage_verification(garage_id,phone_state,contact_person_state,company_document_state,location_state) VALUES($1,$2,$2,$2,$2)',
      [item.id, checked ? 'verified' : 'not_checked'],
    );
    if (item.proof) {
      const file = item.id + '-company-file';
      await client.query(
        "INSERT INTO file_object(id,owner_user_id,storage_key,content_type,size_bytes,scan_state,retention_state) VALUES($1,'demo-admin-owner',$2,'text/plain',$3,'clean','active')",
        [file, 'local-demo/' + file, Buffer.byteLength(staffDemoFixtures['company-valid'])],
      );
      await client.query(
        "INSERT INTO local_demo_file_fixture(file_id,fixture_key) VALUES($1,'company-valid')",
        [file],
      );
      await client.query(
        "INSERT INTO garage_verification_document(file_id,garage_id,uploaded_by_user_id) VALUES($1,$2,'demo-admin-owner')",
        [file, item.id],
      );
      await mark(client, 'file_object', file);
    }
    const photo = item.id + '-photo';
    await client.query(
      "INSERT INTO garage_photo(id,garage_id,uploaded_by_user_id,storage_key,content_type,width,height,visibility) VALUES($1,$2,'demo-admin-owner',$3,'image/webp',640,400,'pending_review')",
      [photo, item.id, 'local-demo/photo/' + photo],
    );
    await client.query(
      "INSERT INTO local_demo_admin_photo(photo_id,fixture_key) VALUES($1,'demo-garage-overview')",
      [photo],
    );
    await client.query('UPDATE garage SET publication_state=$2 WHERE id=$1', [item.id, item.state]);
    await client.query(
      "INSERT INTO moderation_event(id,actor_user_id,subject_type,subject_id,event_type) VALUES($1,$2,'garage',$3,'demo-admin-scenario-prepared')",
      [item.id + '-event', staffDemoOperator, item.id],
    );
    await mark(client, 'garage', item.id);
  }
  const knownPolicy = await client.query(
    "SELECT 1 FROM lifecycle_policy WHERE version='2025-06-v1'",
  );
  if (!knownPolicy.rowCount) {
    await client.query(
      `INSERT INTO lifecycle_policy(version,operator_approval_reference,public_review_handling,
        review_evidence_retention_days,repair_request_retention_days,report_retention_days,
        audit_log_retention_days,configured_by_user_id,configured_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,'demo-admin-owner','2025-06-01T09:00:00Z')
       ON CONFLICT (version) DO NOTHING`,
      [
        '2025-06-v1',
        'VB-2025-06 · Genehmigt durch Geschäftsführung AutoKosova SHPK, 01.06.2025',
        'retain_anonymized',
        730,
        1095,
        365,
        1825,
      ],
    );
  }
  for (const [id, user, status] of [
    ['demo-admin-deletion-policy', 'demo-admin-erase-requester', 'blocked_by_policy'],
    ['demo-admin-deletion-ownership', 'demo-admin-owner', 'manual_content_decision_required'],
  ]) {
    const known = await client.query(
      "SELECT 1 FROM local_demo_seed_entity WHERE entity_type='moderation_case' AND entity_id=$1",
      [id],
    );
    if (known.rowCount) continue;
    const active = await client.query("SELECT 1 FROM app_user WHERE id=$1 AND status='active'", [
      user,
    ]);
    if (!active.rowCount) continue;
    const created = await client.query(
      'INSERT INTO data_deletion_request(id,user_id,status) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
      [id, user, status],
    );
    if (!created.rowCount) throw new Error('Unmanaged administrative deletion scenario collision');
    await client.query(
      "INSERT INTO moderation_case(id,kind,subject_type,subject_id,requester_user_id,status,priority) VALUES($1,'data_deletion','data_deletion',$1,$2,'waiting_for_subject','normal')",
      [id, user],
    );
    await mark(client, 'moderation_case', id);
  }
}
async function mark(client, type, id) {
  await client.query(
    'INSERT INTO local_demo_seed_entity(entity_type,entity_id,seed_version) VALUES($1,$2,$3)',
    [type, id, 'admin-demo-v1'],
  );
}
