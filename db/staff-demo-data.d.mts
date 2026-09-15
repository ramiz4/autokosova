export const staffDemoGarage: string;
export const staffDemoAuthor: string;
export const staffDemoReporter: string;
export const staffDemoForeign: string;
export const staffDemoOperator: string;
export const staffDemoFixtures: Readonly<
  Record<'visit-valid' | 'visit-mismatch' | 'company-valid', string>
>;
export const staffDemoReviews: readonly {
  readonly id: string;
  readonly file: 'visit-valid' | 'visit-mismatch';
  readonly assignment: 'none' | 'moderator' | 'foreign' | 'escalated';
  readonly blocked?: boolean;
}[];
