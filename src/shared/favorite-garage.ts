/** Small projection of the existing published-profile response. No private fields are retained. */
export interface FavoriteGarage {
  readonly id: string;
  readonly name: string;
  readonly placeId: string;
  readonly photoId?: string;
  readonly serviceCategoryIds: readonly string[];
  readonly companyDataVerified: boolean;
  readonly rating?: {
    readonly average: number;
    readonly count: number;
    readonly verifiedVisits: number;
  };
}
export function favoriteGarage(value: unknown, id: string): FavoriteGarage {
  if (!value || typeof value !== 'object') throw new Error('Invalid public profile');
  const data = value as Record<string, unknown>;
  if (
    data['id'] !== id ||
    typeof data['name'] !== 'string' ||
    !data['name'].trim() ||
    data['name'].length > 160 ||
    typeof data['placeId'] !== 'string'
  )
    throw new Error('Invalid public profile');
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.length > 0 && item.length <= 128,
        )
      : [];
  const summary = data['reviewSummary'] as Record<string, unknown> | undefined;
  const average = summary?.['averageRating'],
    count = summary?.['reviewCount'],
    visits = summary?.['verifiedVisitCount'];
  return {
    id,
    name: data['name'],
    placeId: data['placeId'],
    photoId: strings(data['photoIds'])[0],
    serviceCategoryIds: strings(data['serviceCategoryIds']).slice(0, 20),
    companyDataVerified: data['verificationLabel'] === 'Unternehmensdaten geprüft',
    ...(summary?.['state'] === 'available' &&
    typeof average === 'number' &&
    Number.isFinite(average) &&
    average >= 1 &&
    average <= 5 &&
    typeof count === 'number' &&
    Number.isSafeInteger(count) &&
    count > 0 &&
    typeof visits === 'number' &&
    Number.isSafeInteger(visits) &&
    visits >= 0 &&
    visits <= count
      ? { rating: { average, count, verifiedVisits: visits } }
      : {}),
  };
}
