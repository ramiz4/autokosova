import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStaffCaseDecision,
  staffDecisionActions,
  type StaffDecisionContext,
} from '../src/shared/staff-decision';

const context: StaffDecisionContext = {
  kind: 'review_submission',
  status: 'assigned',
  conflictOfInterest: false,
  reviewState: 'under_review',
  evidenceAvailable: true,
  openAppeal: false,
  restorable: false,
};
const checklist = { garageMatches: true, serviceMatches: true, visitMonthMatches: true };

test('staff decisions require an explicit revision, exact fields and three boolean checks', () => {
  const valid = { action: 'publish_review', revision: 2, checklist };
  assert.equal(isStaffCaseDecision(valid), true);
  for (const revision of [undefined, null, 0, -1, 1.5, '2', Infinity, 2147483648]) {
    assert.equal(isStaffCaseDecision({ ...valid, revision }), false);
  }
  assert.equal(isStaffCaseDecision({ ...valid, actorUserId: 'someone-else' }), false);
  assert.equal(isStaffCaseDecision({ ...valid, checklist: { garageMatches: true } }), false);
  assert.equal(
    isStaffCaseDecision({ ...valid, checklist: { ...checklist, serviceMatches: 'true' } }),
    false,
  );
  assert.equal(
    isStaffCaseDecision({ ...valid, checklist: { ...checklist, extra: true } }),
    false,
  );
  assert.equal(isStaffCaseDecision(null), false);
  assert.equal(isStaffCaseDecision([]), false);
  // Negative checkboxes are valid input; publication still requires a positive domain decision.
  assert.equal(
    isStaffCaseDecision({ ...valid, checklist: { ...checklist, garageMatches: false } }),
    true,
  );
});

test('rejection and report decisions accept only matching fixed reason codes', () => {
  assert.equal(
    isStaffCaseDecision({
      action: 'reject_review',
      revision: 1,
      checklist,
      rejectionReason: 'evidence_not_sufficient',
    }),
    true,
  );
  assert.equal(isStaffCaseDecision({ action: 'reject_review', revision: 1, checklist }), false);
  for (const action of ['approve', 'restore']) {
    assert.equal(isStaffCaseDecision({ action, revision: 1, reasonCode: 'no_violation' }), true);
    assert.equal(isStaffCaseDecision({ action, revision: 1, reasonCode: 'abuse' }), false);
  }
  assert.equal(
    isStaffCaseDecision({ action: 'request_information', revision: 1, reasonCode: 'missing_information' }),
    true,
  );
  assert.equal(
    isStaffCaseDecision({ action: 'request_information', revision: 1, reasonCode: 'no_violation' }),
    false,
  );
  assert.equal(
    isStaffCaseDecision({ action: 'temporarily_hide', revision: 1, reasonCode: 'private_data_exposure' }),
    true,
  );
  assert.equal(
    isStaffCaseDecision({ action: 'temporarily_hide', revision: 1, reasonCode: 'no_violation' }),
    false,
  );
  assert.equal(
    isStaffCaseDecision({ action: 'delete', revision: 1, reasonCode: 'other_policy' }),
    false,
  );
});

test('submission actions distinguish a review decision from a generic report closure', () => {
  assert.deepEqual(staffDecisionActions(context), [
    'publish_review',
    'reject_review',
    'request_information',
  ]);
  assert.deepEqual(staffDecisionActions({ ...context, evidenceAvailable: false }), [
    'reject_review',
    'request_information',
  ]);
  assert.deepEqual(staffDecisionActions({ ...context, reviewState: 'submitted' }), []);
  assert.deepEqual(staffDecisionActions({ ...context, status: 'resolved' }), []);
  assert.deepEqual(staffDecisionActions({ ...context, conflictOfInterest: true }), []);
  for (const kind of ['garage_submission', 'data_deletion'] as const) {
    assert.deepEqual(staffDecisionActions({ ...context, kind }), []);
  }
});

test('only reopened independent appeals permit reconsidering a prior review decision', () => {
  for (const reviewState of ['published', 'rejected']) {
    assert.deepEqual(staffDecisionActions({ ...context, reviewState }), []);
    assert.ok(
      staffDecisionActions({ ...context, reviewState, openAppeal: true }).includes('publish_review'),
    );
    assert.deepEqual(
      staffDecisionActions({ ...context, reviewState, openAppeal: true, conflictOfInterest: true }),
      [],
    );
  }
  assert.deepEqual(
    staffDecisionActions({ ...context, reviewState: 'withdrawn', openAppeal: true }),
    [],
  );
});

test('report actions cannot first-publish a garage or restore an unrelated administrative block', () => {
  const report = { ...context, kind: 'report' as const, subjectState: 'published' };
  assert.deepEqual(staffDecisionActions(report), [
    'approve',
    'request_information',
    'reject',
    'temporarily_hide',
  ]);
  assert.deepEqual(
    staffDecisionActions({ ...report, status: 'resolved', subjectState: 'suspended' }),
    [],
  );
  assert.deepEqual(
    staffDecisionActions({ ...report, status: 'resolved', subjectState: 'suspended', restorable: true }),
    ['restore'],
  );
  assert.ok(!staffDecisionActions(report).includes('publish_review'));
  assert.ok(!staffDecisionActions({ ...report, subjectState: 'draft' }).includes('temporarily_hide'));
  assert.deepEqual(
    staffDecisionActions({ ...report, restorable: true, conflictOfInterest: true }),
    [],
  );
});
