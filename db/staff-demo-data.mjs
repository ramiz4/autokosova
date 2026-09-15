// Deliberately fictional, versioned content. No real invoices, contact details or credentials.
export const staffDemoGarage = 'demo-prishtina-bremsen-offen';
export const staffDemoAuthor = 'demo-staff-review-author';
export const staffDemoReporter = 'demo-staff-report-author';
export const staffDemoForeign = 'demo-staff-foreign-moderator';
export const staffDemoOperator = 'demo-staff-history-operator';
export const staffDemoFixtures = Object.freeze({
  'visit-valid':
    'DEMO – kein echter Nachweis\nDEMO – not a real document\n\nDEMO · Bremsen Nord Prishtina\nWerkstatt-ID: demo-prishtina-bremsen-offen\nBesuch: 2026-08\nLeistung: Bremsenprüfung und Bremsbelagwechsel\nNur fiktive Testdaten. Keine Zahlung, Buchung oder echte Reparatur.\n',
  'visit-mismatch':
    'DEMO – kein echter Nachweis\nDEMO – not a real document\n\nDEMO · Anderer Betrieb\nBesuch: 2025-01\nLeistung: Klimaanlagenprüfung\nAbsichtlich unpassender Besuchsnachweis für einen negativen Test.\n',
  'company-valid':
    'DEMO – kein echter Nachweis\nDEMO – not a real document\n\nFiktiver Unternehmensnachweis für eine lokale Werkstattprüfung.\nKeine reale Registrierung, Person oder Kontaktadresse.\n',
});
export const staffDemoReviews = [
  { id: 'demo-staff-review-unassigned', file: 'visit-valid', assignment: 'none' },
  { id: 'demo-staff-review-assigned', file: 'visit-valid', assignment: 'moderator' },
  { id: 'demo-staff-review-mismatch', file: 'visit-mismatch', assignment: 'moderator' },
  { id: 'demo-staff-review-blocked', file: 'visit-valid', assignment: 'moderator', blocked: true },
  { id: 'demo-staff-review-foreign', file: 'visit-valid', assignment: 'foreign' },
  { id: 'demo-staff-review-escalated', file: 'visit-valid', assignment: 'escalated' },
  {
    id: 'demo-staff-review-waiting',
    file: 'visit-valid',
    assignment: 'moderator',
    scenario: 'waiting',
  },
  {
    id: 'demo-staff-review-appeal',
    file: 'visit-valid',
    assignment: 'moderator',
    scenario: 'appeal',
  },
  {
    id: 'demo-staff-review-own-appeal',
    file: 'visit-valid',
    assignment: 'moderator',
    scenario: 'own-appeal',
  },
  {
    id: 'demo-staff-review-reported',
    file: 'visit-valid',
    assignment: 'moderator',
    scenario: 'reported',
  },
  {
    id: 'demo-staff-review-restore',
    file: 'visit-valid',
    assignment: 'moderator',
    scenario: 'restore',
  },
  {
    id: 'demo-staff-review-removed',
    file: 'visit-valid',
    assignment: 'moderator',
    scenario: 'removed',
  },
];
