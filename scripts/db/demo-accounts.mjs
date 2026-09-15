/** Explicit local fixture assignment. Email/profile claims never grant a membership. */
export const demoAccountGarageIds = ['demo-prishtina-bremsen', 'demo-prizren-klima-toyota'];
export const demoAccountRequestIds = [
  'demo-request-prishtina-bremsen',
  'demo-request-prizren-klima',
];

export function readDemoAccountConfig(environment = process.env) {
  const garage = environment.AUTOKOSOVA_DEMO_GARAGE_SUBJECT;
  const customer = environment.AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT;
  if (!garage && !customer) return undefined;
  if (
    !garage ||
    !customer ||
    garage === customer ||
    [garage, customer].some((value) => value.length > 255 || /\s/.test(value))
  )
    throw new Error('Configure two distinct demo OIDC subjects; neither may be empty.');
  let issuer;
  try {
    issuer = new URL(environment.ZITADEL_ISSUER);
  } catch {
    throw new Error('Demo account assignment requires the configured ZITADEL_ISSUER.');
  }
  if (issuer.username || issuer.password || issuer.search || issuer.hash)
    throw new Error('Invalid demo account issuer.');
  if (
    issuer.protocol !== 'https:' &&
    !(issuer.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname))
  )
    throw new Error('Invalid demo account issuer.');
  return { issuer: environment.ZITADEL_ISSUER, garage, customer };
}

export async function isManagedDemoEntity(client, entityType, entityId) {
  const result = await client.query(
    'SELECT 1 FROM local_demo_account_entity WHERE entity_type=$1 AND entity_id=$2',
    [entityType, entityId],
  );
  return !!result.rowCount;
}

async function mark(client, entityType, entityId, accountType) {
  await client.query(
    'INSERT INTO local_demo_account_entity(entity_type,entity_id,account_type) VALUES($1,$2,$3)',
    [entityType, entityId, accountType],
  );
}

export async function seedDemoAccounts(client, config) {
  if (!config) return;
  // All operations run in seedDatabase's transaction; concurrent assignment is serialized.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('local-demo-account-binding', 0))",
  );
  for (const type of ['garage', 'customer']) {
    const id = config[type];
    const previous = await client.query(
      'SELECT user_id,oidc_issuer FROM local_demo_account_binding WHERE account_type=$1',
      [type],
    );
    if (
      previous.rowCount &&
      (previous.rows[0].user_id !== id || previous.rows[0].oidc_issuer !== config.issuer)
    )
      throw new Error(
        'Demo account binding differs from this database. Use a separate local database or an explicit demo reset.',
      );
    await client.query(
      "INSERT INTO app_user(id,oidc_subject,status,account_type) VALUES($1,$1,'active',$2) ON CONFLICT(id) DO NOTHING",
      [id, type],
    );
    const active = await client.query(
      "SELECT 1 FROM app_user WHERE id=$1 AND oidc_subject=$1 AND status='active' FOR UPDATE",
      [id],
    );
    if (!active.rowCount) throw new Error('The configured demo account is unavailable.');
    if (!previous.rowCount)
      await client.query('UPDATE app_user SET account_type=$2 WHERE id=$1', [id, type]);
    await client.query(
      'INSERT INTO local_demo_account_binding(account_type,user_id,oidc_issuer) VALUES($1,$2,$3) ON CONFLICT(account_type) DO NOTHING',
      [type, id, config.issuer],
    );
  }
  for (const [index, id] of demoAccountGarageIds.entries()) {
    if (await isManagedDemoEntity(client, 'garage', id)) continue;
    const provenance = await client.query(
      'SELECT g.id FROM garage g JOIN local_demo_seed_garage p ON p.garage_id=g.id WHERE g.id=$1 AND g.deleted_at IS NULL FOR UPDATE OF g',
      [id],
    );
    if (!provenance.rowCount)
      throw new Error('A required demo garage is missing or not seed-owned.');
    const occupied = await client.query(
      "SELECT 1 FROM membership WHERE garage_id=$1 AND (user_id<>$2 OR role<>'owner' OR state<>'active')",
      [id, config.garage],
    );
    if (occupied.rowCount)
      throw new Error('Demo garage already has an unrelated or revoked membership.');
    await client.query(
      "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'owner','active',$1) ON CONFLICT(user_id,garage_id) DO NOTHING",
      [config.garage, id],
    );
    await client.query(
      'UPDATE garage SET created_by_user_id=$2,business_address=COALESCE(business_address,$3) WHERE id=$1',
      [
        id,
        config.garage,
        index === 0 ? 'Fiktive Demo-Strasse 1, Prishtina' : 'Fiktive Demo-Strasse 2, Prizren',
      ],
    );
    await client.query(
      `INSERT INTO garage_consent(id,garage_id,applicant_user_id,recorded_by_user_id,source,consent_version)
       SELECT $1,$2,$3,$3,'documented_support_request','local-demo-account-v1'
       WHERE NOT EXISTS (SELECT 1 FROM garage_consent WHERE garage_id=$2)`,
      ['demo-account-consent-' + id, id, config.garage],
    );
    await mark(client, 'garage', id, 'garage');
  }
  for (const id of demoAccountRequestIds) {
    if (await isManagedDemoEntity(client, 'repair_request', id)) continue;
    const provenance = await client.query(
      `SELECT r.id FROM repair_request r JOIN local_demo_seed_entity p
       ON p.entity_id=r.id AND p.entity_type='repair_request' WHERE r.id=$1 FOR UPDATE OF r`,
      [id],
    );
    if (!provenance.rowCount)
      throw new Error('A required demo request is missing or not seed-owned.');
    await client.query('UPDATE repair_request SET owner_user_id=$2 WHERE id=$1', [
      id,
      config.customer,
    ]);
    await mark(client, 'repair_request', id, 'customer');
  }
}
