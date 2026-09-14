// Canonical English paths, shared by the router and language switching.
// Keep garage information routes ahead of the dynamic garages/:garageId route.
export const PUBLIC_PAGE_PATHS = {
  help: '/help',
  partners: '/garages/partners',
  benefits: '/garages/benefits',
  mission: '/about',
  careers: '/careers',
  blog: '/blog',
  privacy: '/privacy',
  terms: '/terms',
  imprint: '/imprint',
} as const;

export type PublicPageId = keyof typeof PUBLIC_PAGE_PATHS;

export function isPublicPageId(value: unknown): value is PublicPageId {
  return typeof value === 'string' && Object.hasOwn(PUBLIC_PAGE_PATHS, value);
}
