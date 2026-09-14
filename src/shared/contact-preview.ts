export interface ContactPreviewInput {
  readonly includeDetails: boolean;
  readonly repairSummary?: string;
  readonly vehicleSummary?: string;
  readonly garageName: string;
}

const phonePattern = /^\+?[1-9]\d{6,14}$/;

/**
 * A contact preview never reads a stored repair request. The caller must supply any optional
 * vehicle or repair text after an explicit local opt-in, so VINs, files, dates, and private URLs
 * cannot be appended by the search handoff.
 */
export function buildContactPreview(input: ContactPreviewInput): string {
  const lines = [
    `Hallo ${cleanLine(input.garageName)},`,
    '',
    'ich möchte eine Reparatur direkt mit Ihnen abstimmen.',
  ];
  if (input.includeDetails) {
    const vehicleSummary = cleanLine(input.vehicleSummary ?? '');
    const repairSummary = cleanLine(input.repairSummary ?? '');
    if (vehicleSummary) lines.push(`Fahrzeug: ${vehicleSummary}`);
    if (repairSummary) lines.push(`Anliegen: ${repairSummary}`);
  }
  lines.push('', 'Viele Grüsse');
  return lines.join('\n');
}

export function buildTelephoneHref(phone: string | undefined): string | undefined {
  const normalized = normalizePhone(phone);
  return normalized ? `tel:${normalized}` : undefined;
}

export function buildWhatsAppHref(phone: string | undefined, preview: string): string | undefined {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(preview)}`;
}

function cleanLine(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 500);
}

function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const normalized = phone.replace(/[\s().-]/g, '');
  if (!phonePattern.test(normalized)) return undefined;
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}
