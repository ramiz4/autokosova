export function isStaticAssetRequest(url: string): boolean {
  const path = url.split('?', 1)[0];
  return /\.(?:css|js|map|mjs|png|jpe?g|webp|svg|ico|woff2?)$/i.test(path);
}
