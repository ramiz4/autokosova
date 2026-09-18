import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { AccessStore, type Principal } from '../src/server/access';
import { createServer } from '../src/server/app';
import { PostgresAdministrationStore } from '../src/server/administration-store';
import { PostgresGarageOnboardingStore } from '../src/server/garage-onboarding-store';
import { PostgresModerationStore } from '../src/server/moderation-store';
import { LocalDemoFileStore } from '../src/server/local-demo-files';
import { seedDatabase } from '../scripts/db/seed-data.mjs';
import { validGarageProfile, type VerificationChecklist } from '../src/shared/garage-onboarding';
const databaseUrl = process.env['DATABASE_URL'];
const verified: VerificationChecklist = {
  phone: 'verified',
  contactPerson: 'verified',
  companyDocument: 'verified',
  location: 'verified',
};
const principal = (userId: string, role: 'admin' | 'moderator' | 'customer'): Principal => ({
  userId,
  roles: new Set([role]),
  sessionId: 'synthetic-' + userId,
  csrfToken: 'synthetic-csrf',
});

test(
  'administration: real non-owner RLS, verification, memberships, support, deletion gates and persisted demo',
  { skip: !databaseUrl, timeout: 60000 },
  async () => {
    const schema = 'admin_test_' + randomUUID().replaceAll('-', ''),
      runtime = schema + '_runtime';
    const source = new URL(databaseUrl!);
    assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
    const root = new pg.Client({ connectionString: source.href });
    await root.connect();
    await root.query(`CREATE SCHEMA ${schema}`);
    source.searchParams.set('options', '-csearch_path=' + schema + ',public');
    const seed = new pg.Client({ connectionString: source.href });
    await seed.connect();
    let adminStore: PostgresAdministrationStore | undefined,
      domain: PostgresGarageOnboardingStore | undefined,
      lifecycle: PostgresModerationStore | undefined,
      files: LocalDemoFileStore | undefined,
      roleCreated = false;
    try {
      const dir = new URL('../db/migrations/', import.meta.url);
      for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
        await seed.query(
          (await readFile(new URL(name, dir), 'utf8')).replaceAll("'public.", "'" + schema + '.'),
        );
      const env = {
        NODE_ENV: 'test',
        AUTOKOSOVA_DEMO_ADMIN_SUBJECT: 'admin-regression',
        AUTOKOSOVA_DEMO_MODERATOR_SUBJECT: 'admin-regression-moderator',
      };
      await seedDatabase(seed, 'demo', env);
      await root.query(`CREATE ROLE ${runtime} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      roleCreated = true;
      await root.query(`GRANT USAGE ON SCHEMA ${schema},public TO ${runtime}`);
      await root.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${runtime}`,
      );
      await root.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${runtime}`);
      source.searchParams.set('options', '-csearch_path=' + schema + ',public -crole=' + runtime);
      adminStore = new PostgresAdministrationStore(source.href);
      domain = new PostgresGarageOnboardingStore(source.href);
      lifecycle = new PostgresModerationStore(source.href);
      files = new LocalDemoFileStore(source.href, {
        NODE_ENV: 'test',
        AUTOKOSOVA_LOCAL_DEMO_FILES: '1',
      });
      await lifecycle.recordVerifiedIdentity('admin-regression', ['admin'], {
        displayName: 'DEMO Admin',
      });
      await lifecycle.recordVerifiedIdentity('admin-regression-moderator', ['moderator'], {
        displayName: 'DEMO Moderator',
      });
      const a = principal('admin-regression', 'admin'),
        m = principal('admin-regression-moderator', 'moderator'),
        owner = principal('demo-admin-owner', 'customer');
      const takeover = 'review:demo-staff-review-unassigned';
      await lifecycle.assignStaffCase(a, takeover, {
        moderatorUserId: a.userId,
        revision: (await lifecycle.getStaffCase(a, takeover)).revision,
      });
      assert.equal((await lifecycle.getStaffCase(a, takeover)).assignedModeratorUserId, a.userId);
      assert.deepEqual(
        (await lifecycle.listStaffCases(a, { assignedUserId: a.userId })).cases.map((c) => c.id),
        [takeover],
      );
      await assert.rejects(lifecycle.listStaffCases(m, { assignedUserId: a.userId }));
      const id = 'demo-admin-garage-pending';
      const before = await adminStore.garage(a, id);
      assert.equal(before.publicationState, 'pending_review');
      assert.equal(validGarageProfile(before.profile, before.profile), true);
      const overview = await adminStore.overview(a);
      assert.equal(overview.pendingGarages >= 2, true);
      assert.equal(
        overview.unassignedCases,
        (await lifecycle.listStaffCases(a, { queue: 'todo', unassigned: true })).cases.length,
      );
      assert.equal(
        overview.escalatedCases,
        (await lifecycle.listStaffCases(a, { queue: 'todo', escalated: true })).cases.length,
      );
      assert.equal(
        overview.openReviews,
        (await lifecycle.listStaffCases(a, { queue: 'todo', kind: 'review_submission' })).cases
          .length,
      );
      assert.equal(
        overview.openReports,
        (await lifecycle.listStaffCases(a, { queue: 'todo', kind: 'report' })).cases.length,
      );
      assert.equal(
        overview.openAppeals,
        (await lifecycle.listStaffCases(a, { queue: 'todo', appeal: true })).cases.length,
      );
      for (const person of [m, owner]) {
        await assert.rejects(adminStore.overview(person));
        await assert.rejects(adminStore.users(person, {}));
        await assert.rejects(adminStore.garage(person, id));
        await assert.rejects(adminStore.privacy(person, {}));
        await assert.rejects(adminStore.auditPage(person, {}));
        await assert.rejects(adminStore.catalog(person));
      }
      const file = before.documents[0].fileId;
      const grant = await files.issue(a, file);
      assert.match(await files.consume(a, file, grant.grantId), /Fiktiver/);
      await assert.rejects(files.issue(m, file));
      await assert.rejects(
        adminStore.decideGarage(a, id, {
          revision: before.revision,
          reason: 'company_verified',
          decision: 'published',
          verification: { ...verified, phone: 'not_checked' },
        }),
      );
      assert.equal((await adminStore.garage(a, id)).revision, before.revision);
      const auditBeforeInvalidPoint = await seed.query(
        'SELECT count(*)::integer AS count FROM moderation_event WHERE subject_id=$1',
        [id],
      );
      await assert.rejects(
        adminStore.decideGarage(a, id, {
          revision: before.revision,
          reason: 'company_verified',
          decision: 'rejected',
          verification: before.verification,
          locationPoint: { latitude: 91, longitude: 21 } as never,
        }),
      );
      const afterInvalidPoint = await adminStore.garage(a, id);
      assert.equal(afterInvalidPoint.revision, before.revision);
      assert.equal(
        afterInvalidPoint.profile.locationPoint?.latitude,
        before.profile.locationPoint?.latitude,
      );
      assert.equal(
        (
          await seed.query(
            'SELECT count(*)::integer AS count FROM moderation_event WHERE subject_id=$1',
            [id],
          )
        ).rows[0].count,
        auditBeforeInvalidPoint.rows[0].count,
      );
      await adminStore.verifyGarage(a, id, {
        revision: before.revision,
        reason: 'company_verified',
        verification: verified,
        locationPoint: before.profile.locationPoint,
      });
      await assert.rejects(
        adminStore.decideGarage(a, id, {
          revision: before.revision,
          reason: 'company_verified',
          decision: 'published',
          verification: verified,
        }),
      );
      const checked = await adminStore.garage(a, id);
      await adminStore.decideGarage(a, id, {
        revision: checked.revision,
        reason: 'company_verified',
        decision: 'published',
        verification: verified,
      });
      assert.equal(
        (await seed.query('SELECT 1 FROM public_garage_profile WHERE id=$1', [id])).rowCount,
        1,
      );
      const incomplete = await adminStore.garage(a, 'demo-admin-garage-incomplete');
      await assert.rejects(
        adminStore.decideGarage(a, incomplete.id, {
          revision: incomplete.revision,
          reason: 'company_verified',
          decision: 'published',
          verification: verified,
        }),
      );
      await adminStore.decideGarage(a, incomplete.id, {
        revision: incomplete.revision,
        reason: 'missing_information',
        decision: 'rejected',
        verification: incomplete.verification,
      });
      // Pending photos do not become public just because their profile was published.
      const published = await adminStore.garage(a, id),
        photo = published.photos[0];
      assert.equal(await adminStore.publicPhoto(id, photo.id), undefined);
      await adminStore.decidePhoto(a, id, photo.id, {
        revision: published.revision,
        reason: 'company_verified',
        approved: true,
      });
      assert.match((await adminStore.publicPhoto(id, photo.id)) ?? '', /^\/images\/demo\/garages/);
      let current = await adminStore.garage(a, id);
      await adminStore.decideGarage(a, id, {
        revision: current.revision,
        reason: 'policy_violation',
        decision: 'suspended',
        verification: current.verification,
      });
      assert.equal(await adminStore.publicPhoto(id, photo.id), undefined);
      current = await adminStore.garage(a, id);
      assert.equal(current.adminSuspended, true);
      await adminStore.decideGarage(a, id, {
        revision: current.revision,
        reason: 'company_verified',
        decision: 'restore',
        verification: current.verification,
      });
      assert.equal((await adminStore.garage(a, id)).publicationState, 'published');
      // Last-owner protection applies to direct API-backed changes and transfers are atomic.
      const memberId = 'demo-admin-garage-members';
      const membership = await adminStore.garage(a, memberId);
      await assert.rejects(
        adminStore.changeMember(a, memberId, {
          revision: membership.revision,
          reason: 'ownership_change',
          userId: owner.userId,
          role: 'owner',
          state: 'revoked',
        }),
      );
      await assert.rejects(
        adminStore.changeMember(m, memberId, {
          revision: membership.revision,
          reason: 'ownership_change',
          userId: owner.userId,
          role: 'editor',
          state: 'active',
        }),
      );
      await adminStore.transferOwner(a, memberId, {
        revision: membership.revision,
        reason: 'ownership_change',
        fromUserId: owner.userId,
        toUserId: 'demo-admin-next-owner',
      });
      const transferHistory = await seed.query<{ subject_id: string; event_type: string }>(
        "SELECT subject_id,event_type FROM moderation_event WHERE subject_type='garage_membership'",
      );
      assert.ok(
        transferHistory.rows.some(
          (e) =>
            e.subject_id === JSON.stringify([memberId, owner.userId]) &&
            e.event_type === 'membership-owner-active-to-editor-active',
        ),
      );
      assert.ok(
        transferHistory.rows.some(
          (e) =>
            e.subject_id === JSON.stringify([memberId, 'demo-admin-next-owner']) &&
            e.event_type.endsWith('-to-owner-active'),
        ),
      );
      let transferred = await adminStore.garage(a, memberId);
      assert.ok(
        transferred.members.some(
          (u) => u.userId === 'demo-admin-next-owner' && u.role === 'owner' && u.state === 'active',
        ),
      );
      assert.ok(transferred.members.some((u) => u.userId === owner.userId && u.role === 'editor'));
      await adminStore.changeMember(a, memberId, {
        revision: transferred.revision,
        reason: 'ownership_change',
        userId: 'demo-admin-editor',
        role: 'editor',
        state: 'revoked',
      });
      await assert.rejects(
        domain.getPrivateGarage(principal('demo-admin-editor', 'customer'), memberId),
      );
      // No private customer objects are transferred with garage membership.
      const visible = await adminStore.users(a, { query: 'demo-admin-next-owner' });
      assert.equal(visible.items[0].roles.includes('admin'), false);
      assert.equal(
        visible.items[0].memberships.some((g) => g.garageId === memberId),
        true,
      );
      await assert.rejects(
        adminStore.assistedGarage(a, {
          applicantUserId: 'does-not-exist',
          profile: before.profile,
          consentVersion: 'demo',
          requestReference: 'DEMO-request',
        }),
      );
      const created = await adminStore.assistedGarage(a, {
        applicantUserId: owner.userId,
        profile: { ...before.profile, name: 'DEMO · Auftrag spezifisch' },
        consentVersion: 'DEMO-consent',
        requestReference: 'DEMO-support-request',
      });
      const createdDetail = await adminStore.garage(a, created.id);
      assert.equal(createdDetail.publicationState, 'draft');
      assert.equal(
        createdDetail.members.some((g) => g.userId === a.userId),
        false,
      );
      assert.equal(
        (await seed.query('SELECT 1 FROM garage_support_request WHERE garage_id=$1', [created.id]))
          .rowCount,
        1,
      );
      await assert.rejects(domain.updateGarageProfile(a, created.id, createdDetail.profile));
      await adminStore.correctProfile(a, created.id, {
        revision: createdDetail.revision,
        reason: 'documented_support',
        requestReference: 'DEMO-support-change',
        profile: {
          ...createdDetail.profile,
          description: 'DEMO – Korrektur im ausdrücklich dokumentierten Auftrag.',
        },
      });
      const corrected = await adminStore.garage(a, created.id);
      await adminStore.submitSupported(a, created.id, {
        revision: corrected.revision,
        reason: 'documented_support',
        requestReference: 'DEMO-support-submission',
      });
      assert.equal((await adminStore.garage(a, created.id)).publicationState, 'pending_review');
      // New membership cannot let the same admin self-approve.
      const self = await adminStore.garage(a, created.id);
      await adminStore.changeMember(a, created.id, {
        revision: self.revision,
        reason: 'ownership_change',
        userId: a.userId,
        role: 'editor',
        state: 'active',
      });
      await assert.rejects(
        adminStore.verifyGarage(a, created.id, {
          revision: (await adminStore.garage(a, created.id)).revision,
          reason: 'company_verified',
          verification: verified,
        }),
      );
      const unavailable = await adminStore.garage(a, 'demo-admin-garage-unrestorable');
      assert.ok(
        unavailable.members.some(
          (m) => m.userId === 'demo-admin-former-editor' && m.state === 'revoked',
        ),
      );
      await assert.rejects(
        domain.getPrivateGarage(principal('demo-admin-former-editor', 'customer'), unavailable.id),
      );
      await assert.rejects(
        adminStore.decideGarage(a, unavailable.id, {
          revision: unavailable.revision,
          reason: 'company_verified',
          decision: 'restore',
          verification: verified,
        }),
        (error: unknown) => (error as { statusCode: number }).statusCode === 422,
      );
      await domain.deleteGarage(owner, unavailable.id);
      const deleted = await adminStore.garage(a, unavailable.id);
      assert.equal(deleted.deleted, true);
      await assert.rejects(
        adminStore.decideGarage(a, unavailable.id, {
          revision: deleted.revision,
          reason: 'company_verified',
          decision: 'restore',
          verification: verified,
        }),
      );
      const privacy = await adminStore.privacy(a, {});
      assert.ok(privacy.requests.some((r) => r.status === 'blocked_by_policy'));
      assert.ok(privacy.requests.some((r) => r.status === 'manual_content_decision_required'));
      const blockedPrivacy = await adminStore.privacy(a, { status: 'blocked' });
      assert.ok(
        blockedPrivacy.requests.every((r) =>
          ['blocked_by_policy', 'manual_content_decision_required'].includes(r.status),
        ),
      );
      const ownershipContext = await adminStore.privacy(a, {
        requestId: 'demo-admin-deletion-ownership',
      });
      assert.equal(ownershipContext.selected?.runnable, false);
      assert.ok(ownershipContext.selected?.ownedGarages.length);
      assert.deepEqual(ownershipContext.selected?.ownerOnlyObjectTypes, [
        'vehicles',
        'repair_requests',
        'garage_favorites',
      ]);
      await assert.rejects(lifecycle.processPersonalDataDeletion(a, 'demo-admin-deletion-policy'));
      const policy = {
        version: 'SYNTHETIC-TEST-ONLY',
        operatorApprovalReference: 'SYNTHETIC TEST - NOT OPERATOR APPROVAL',
        publicReviewHandling: 'delete' as const,
        reviewEvidenceRetentionDays: 30,
        repairRequestRetentionDays: 30,
        reportRetentionDays: 30,
        auditLogRetentionDays: 90,
      };
      const policyRecord = await lifecycle.configureRetentionPolicy(a, policy);
      assert.deepEqual(await lifecycle.configureRetentionPolicy(a, policy), policyRecord);
      await assert.rejects(
        lifecycle.configureRetentionPolicy(a, { ...policy, auditLogRetentionDays: 91 }),
        (error: unknown) => (error as { statusCode: number }).statusCode === 409,
      );
      assert.equal(
        (
          await seed.query(
            "SELECT count(*)::integer AS n FROM moderation_event WHERE event_type='retention-policy-configured' AND subject_id=$1",
            [policy.version],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        lifecycle.processPersonalDataDeletion(a, 'demo-admin-deletion-policy', 'OTHER-POLICY'),
        (error: unknown) => (error as { statusCode: number }).statusCode === 409,
      );
      assert.equal(
        (
          await seed.query(
            "SELECT status FROM data_deletion_request WHERE id='demo-admin-deletion-policy'",
          )
        ).rows[0].status,
        'submitted',
      );
      await assert.rejects(
        lifecycle.processPersonalDataDeletion(a, 'demo-admin-deletion-ownership'),
      );
      // These are synthetic owner-only objects. A non-owner runtime must actually erase them,
      // not silently affect zero rows under RLS and nevertheless announce completion.
      await seed.query(
        "INSERT INTO vehicle(id,owner_user_id,label) VALUES('erase-vehicle','demo-admin-erase-requester','DEMO private vehicle')",
      );
      await seed.query(
        "INSERT INTO repair_request(id,owner_user_id,vehicle_id,service_category_id,earliest_dropoff_on,latest_pickup_on) VALUES('erase-request','demo-admin-erase-requester','erase-vehicle','bremsen','2026-09-01','2026-09-20')",
      );
      await seed.query(
        "INSERT INTO file_object(id,owner_user_id,storage_key,content_type,size_bytes,scan_state,retention_state) VALUES('erase-file','demo-admin-erase-requester','local-demo/erase-file','text/plain',40,'clean','active')",
      );
      await seed.query(
        "INSERT INTO repair_request_attachment(repair_request_id,file_id) VALUES('erase-request','erase-file')",
      );
      await seed.query(
        "INSERT INTO garage_favorite(owner_user_id,garage_id) VALUES('demo-admin-erase-requester',$1)",
        [id],
      );
      assert.equal((await lifecycle.exportPersonalData(a)).repairRequests.length, 0);
      await adminStore.refreshDeletion(a, 'demo-admin-deletion-policy');
      const readyContext = await adminStore.privacy(a, {
        requestId: 'demo-admin-deletion-policy',
      });
      assert.equal(readyContext.selected?.runnable, true);
      assert.equal(readyContext.selected?.boundPolicy?.version, policy.version);
      assert.equal((await adminStore.overview(a)).pendingDeletions >= 1, true);
      // Readiness is current, not a stale stored label: a new ownership blocker removes the
      // request from the runnable filter/count without giving this admin a customer read path.
      await seed.query(
        "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES('demo-admin-erase-requester','demo-admin-garage-members','owner','active','admin-regression') ON CONFLICT(user_id,garage_id) DO UPDATE SET role='owner',state='active'",
      );
      const changedOwnership = await adminStore.privacy(a, {
        status: 'blocked',
        requestId: 'demo-admin-deletion-policy',
      });
      assert.equal(changedOwnership.selected?.runnable, false);
      await seed.query(
        "UPDATE membership SET state='revoked' WHERE user_id='demo-admin-erase-requester' AND garage_id='demo-admin-garage-members'",
      );
      await adminStore.refreshDeletion(a, 'demo-admin-deletion-policy');
      const deletion = await lifecycle.processPersonalDataDeletion(a, 'demo-admin-deletion-policy');
      assert.equal(deletion.userId, 'demo-admin-erase-requester');
      for (const table of ['vehicle', 'repair_request', 'garage_favorite']) {
        const count = await seed.query(
          `SELECT count(*)::integer AS count FROM ${table} WHERE owner_user_id='demo-admin-erase-requester'`,
        );
        assert.equal(
          count.rows[0].count,
          0,
          table + ' must be erased, not hidden from the runtime',
        );
      }
      assert.equal(
        (
          await seed.query(
            "SELECT 1 FROM repair_request_attachment WHERE repair_request_id='erase-request'",
          )
        ).rowCount,
        0,
      );
      const completedContext = await adminStore.privacy(a, {
        requestId: 'demo-admin-deletion-policy',
      });
      assert.equal(completedContext.selected?.status, 'completed');
      assert.equal(completedContext.selected?.pendingFileDeletions, 1);
      assert.equal(
        (
          await seed.query(
            "SELECT 1 FROM object_deletion_task WHERE file_id='erase-file' AND completed_at IS NULL",
          )
        ).rowCount,
        1,
      );

      const saved = await adminStore.garage(a, id);
      await seedDatabase(seed, 'demo', env);
      assert.deepEqual(await adminStore.garage(a, id), saved);
      assert.deepEqual(await adminStore.garage(a, unavailable.id), deleted);
      assert.equal(
        (await seed.query("SELECT status FROM app_user WHERE id='demo-admin-erase-requester'"))
          .rows[0].status,
        'suspended',
      );
      assert.equal(
        (
          await seed.query(
            "SELECT status FROM data_deletion_request WHERE id='demo-admin-deletion-policy'",
          )
        ).rows[0].status,
        'completed',
      );
      const access = new AccessStore();
      access.addRole(a.userId, 'admin');
      access.addRole(m.userId, 'moderator');
      const adminSession = access.createSession(a.userId),
        modSession = access.createSession(m.userId),
        customerSession = access.createSession(owner.userId);
      const headers = (session: typeof adminSession, write = true) => ({
        cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
        ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
      });
      const app = createServer({
        accessStore: access,
        administrationStore: adminStore,
        garageStore: domain,
        moderationStore: lifecycle,
        localDemoFiles: files,
      });
      try {
        assert.equal((await app.inject({ url: '/api/admin/management/users' })).statusCode, 401);
        for (const session of [modSession, customerSession])
          assert.equal(
            (await app.inject({ url: '/api/admin/management/users', headers: headers(session) }))
              .statusCode,
            403,
          );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/admin/lifecycle/data-deletion-requests/demo-admin-deletion-ownership/process',
              headers: headers(adminSession),
              payload: {},
            })
          ).statusCode,
          400,
        );
        const response = await app.inject({
          url: '/api/admin/management/garages/' + id,
          headers: headers(adminSession),
        });
        assert.equal(response.statusCode, 200);
        assert.match(response.headers['cache-control']!, /no-store/);
        const body = {
          revision: saved.revision,
          reason: 'policy_violation',
          decision: 'suspended',
          verification: verified,
        };
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/admin/management/garages/' + id + '/decision',
              headers: headers(adminSession, false),
              payload: body,
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/admin/management/garages/' + id + '/decision',
              headers: headers(adminSession),
              payload: { ...body, admin: true },
            })
          ).statusCode,
          422,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/admin/garages/' + id + '/decision',
              headers: headers(adminSession),
              payload: { decision: 'suspended', verification: verified },
            })
          ).statusCode,
          422,
        );
        assert.equal(
          (
            await app.inject({
              url: '/api/admin/management/provider',
              headers: headers(adminSession),
            })
          ).body,
          '{}',
        );
        assert.equal(
          (
            await app.inject({
              url: '/api/admin/management/catalog',
              headers: headers(adminSession),
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/admin/management/users/' + owner.userId + '/revoke-sessions',
              headers: headers(adminSession),
              payload: {},
            })
          ).statusCode,
          204,
        );
        assert.equal(
          (await app.inject({ url: '/api/me', headers: headers(customerSession) })).statusCode,
          401,
        );
        await lifecycle.recordVerifiedIdentity(a.userId, [], { displayName: 'DEMO Admin' });
        assert.equal(
          (await app.inject({ url: '/api/admin/management/users', headers: headers(adminSession) }))
            .statusCode,
          403,
        );
      } finally {
        await app.close();
        adminStore = undefined;
        domain = undefined;
        lifecycle = undefined;
        files = undefined;
      }
    } finally {
      await files?.close();
      await adminStore?.close();
      await domain?.close();
      await lifecycle?.close();
      await seed.end();
      await root.query(`DROP SCHEMA ${schema} CASCADE`);
      try {
        if (roleCreated) {
          await root.query(`REVOKE USAGE ON SCHEMA public FROM ${runtime}`);
          await root.query(`DROP ROLE ${runtime}`);
        }
      } finally {
        await root.end();
      }
    }
  },
);
