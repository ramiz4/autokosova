import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRepairRequest } from '../src/shared/repair-request-validation';
import type { RepairRequestInput } from '../src/shared/repair-request';

const validInput: RepairRequestInput = {
  areas: [{ placeId: 'xk-pristina', radiusKm: 10 }],
  earliestDropoffOn: '2026-01-05',
  latestPickupOn: '2026-01-10',
  serviceCategoryId: 'bremsen',
};

test('a well-formed request passes validation', () => {
  assert.equal(validateRepairRequest(validInput), undefined);
});

test('rejects an unknown service category', () => {
  assert.equal(
    validateRepairRequest({ ...validInput, serviceCategoryId: 'oil-change' as never }),
    'Please choose a known service category',
  );
});

test('rejects more than the maximum number of search areas', () => {
  const areas = [
    { placeId: 'xk-pristina', radiusKm: 10 },
    { placeId: 'xk-prizren', radiusKm: 10 },
    { placeId: 'xk-peja', radiusKm: 10 },
    { placeId: 'xk-gjakova', radiusKm: 10 },
  ] as const;
  assert.equal(
    validateRepairRequest({ ...validInput, areas }),
    'Choose at most three search areas',
  );
});

test('rejects duplicate places across search areas', () => {
  const areas = [
    { placeId: 'xk-pristina', radiusKm: 10 },
    { placeId: 'xk-pristina', radiusKm: 20 },
  ] as const;
  assert.equal(
    validateRepairRequest({ ...validInput, areas }),
    'Each search area must use a different place',
  );
});

test('rejects an unknown place and an out-of-range radius', () => {
  assert.equal(
    validateRepairRequest({
      ...validInput,
      areas: [{ placeId: 'xk-unknown' as never, radiusKm: 10 }],
    }),
    'Please choose a known place',
  );
  assert.equal(
    validateRepairRequest({ ...validInput, areas: [{ placeId: 'xk-pristina', radiusKm: 1 }] }),
    'Radius must be between 5 and 100 km',
  );
});

test('rejects inconsistent or malformed travel dates', () => {
  assert.equal(
    validateRepairRequest({
      ...validInput,
      earliestDropoffOn: '2026-01-10',
      latestPickupOn: '2026-01-05',
    }),
    'Earliest drop-off and latest pickup must be consistent local calendar dates',
  );
  assert.equal(
    validateRepairRequest({
      ...validInput,
      earliestDropoffOn: '2026-02-30',
      latestPickupOn: '2026-03-01',
    }),
    'Earliest drop-off and latest pickup must be consistent local calendar dates',
  );
});

test('rejects a symptom description over the length limit', () => {
  assert.equal(
    validateRepairRequest({ ...validInput, symptom: 'x'.repeat(2001) }),
    'Symptom description is too long',
  );
});

test('validates optional vehicle details', () => {
  assert.equal(
    validateRepairRequest({
      ...validInput,
      vehicle: { vehicleClass: 'sedan' as never },
    }),
    'Unknown vehicle class',
  );
  assert.equal(
    validateRepairRequest({ ...validInput, vehicle: { fuel: 'coal' as never } }),
    'Unknown fuel',
  );
  assert.equal(
    validateRepairRequest({
      ...validInput,
      vehicle: { engineDetails: 'x'.repeat(121) },
    }),
    'Vehicle details are too long',
  );
  assert.equal(
    validateRepairRequest({ ...validInput, vehicle: { makeId: 'lada' as never } }),
    'Please choose a known vehicle make',
  );
  assert.equal(
    validateRepairRequest({ ...validInput, vehicle: { model: '' } }),
    'Vehicle model is required and must be at most 120 characters',
  );
  assert.equal(
    validateRepairRequest({ ...validInput, vehicle: { year: 1800 } }),
    'Vehicle year is outside the supported range',
  );
  assert.equal(
    validateRepairRequest({ ...validInput, vehicle: { mileageKm: -1 } }),
    'Mileage is outside the supported range',
  );
  assert.equal(
    validateRepairRequest({
      ...validInput,
      vehicle: { makeId: 'audi', model: 'A4', year: 2020, mileageKm: 50_000 },
    }),
    undefined,
  );
});

test('rejects too many or duplicate attachments', () => {
  assert.equal(
    validateRepairRequest({
      ...validInput,
      attachmentIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    }),
    'Attach at most 5 files',
  );
  assert.equal(
    validateRepairRequest({ ...validInput, attachmentIds: ['a', 'a'] }),
    'Each attachment can only be selected once',
  );
});
