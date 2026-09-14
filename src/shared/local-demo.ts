export const LOCAL_DEMO_PHOTOS = [
  { id: 'demo-garage-overview', file: 'garage-overview.webp' },
  { id: 'demo-engine-service', file: 'engine-service.webp' },
  { id: 'demo-reception', file: 'reception.webp' },
  { id: 'demo-garage-suv', file: 'garage-suv.webp' },
] as const;

export function isLocalDemoGarageId(garageId: string | undefined): boolean {
  return garageId?.startsWith('demo-') ?? false;
}

export function localDemoPhotoPath(
  garageId: string | undefined,
  photoId: string,
): string | undefined {
  if (!isLocalDemoGarageId(garageId)) return undefined;
  const photo = LOCAL_DEMO_PHOTOS.find((candidate) => candidate.id === photoId);
  return photo ? `/images/demo/garages/${photo.file}` : undefined;
}
