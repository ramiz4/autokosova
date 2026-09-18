// Deliberately fictional, versioned content. No real invoices, contact details or credentials.
export const staffDemoGarage = 'demo-prishtina-bremsen-offen';
export const staffDemoAuthor = 'demo-staff-review-author';
export const staffDemoReporter = 'demo-staff-report-author';
export const staffDemoForeign = 'demo-staff-foreign-moderator';
export const staffDemoOperator = 'demo-staff-history-operator';

export const staffDemoDisplayNames = {
  [staffDemoAuthor]: { name: 'Dafina Kelmendi', roles: [] },
  [staffDemoReporter]: { name: 'Behar Lleshi', roles: [] },
  [staffDemoForeign]: { name: 'Teuta Osmani', roles: ['moderator'] },
  [staffDemoOperator]: { name: 'Arlind Bytyqi', roles: ['moderator'] },
};
export const staffDemoFixtures = Object.freeze({
  'visit-valid':
    'Bremsen-Centrum Nord\nRruga Agim Ramadani 14, Prishtina\nTel: +383 44 100 125\n\nLeistungsnachweis\nBesuch: August 2026\nLeistung: Bremsenprüfung und Bremsbelagwechsel Vorderachse\nFahrzeug: Škoda Octavia\n\nFiktiver Beleg – kein realer Betrieb oder Auftrag.\n',
  'visit-mismatch':
    'Klima-Center Gjilan\nRruga Fehmi Agani 8, Gjilan\nTel: +383 44 100 122\n\nLeistungsnachweis\nBesuch: Januar 2025\nLeistung: Klimaanlagenprüfung und Kältemittelbefüllung\nFahrzeug: VW Golf\n\nFiktiver Beleg – absichtlich abweichende Werkstatt für Testszenarien.\n',
  'company-valid':
    'Bremsen-Centrum Nord\nGeschäftsinhaber: Arben Krasniqi\nNIPT: K12345678A\nRruga Agim Ramadani 14, 10000 Prishtina\n\nFiktiver Unternehmensnachweis – keine reale Registrierung oder Person.\n',
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
