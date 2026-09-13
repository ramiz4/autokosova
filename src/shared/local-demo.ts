export function isLocalDemoWorkshopId(workshopId: string | undefined): boolean {
  return workshopId?.startsWith('demo-') ?? false;
}
