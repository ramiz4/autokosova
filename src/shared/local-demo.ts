export function isLocalDemoGarageId(garageId: string | undefined): boolean {
  return garageId?.startsWith('demo-') ?? false;
}
