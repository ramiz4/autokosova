import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContactPreview,
  buildTelephoneHref,
  buildWhatsAppHref,
} from '../src/shared/contact-preview';

test('contact preview does not append private request values without the explicit local opt-in', () => {
  const preview = buildContactPreview({
    includeDetails: false,
    repairSummary: 'Privater Diagnosebericht unter https://files.example/report.pdf',
    vehicleSummary: 'VIN: WVGZZZ1TZBW000001',
    workshopName: 'Fiktive Werkstatt',
  });

  assert.match(preview, /Fiktive Werkstatt/);
  assert.equal(preview.includes('VIN'), false);
  assert.equal(preview.includes('https://files.example'), false);
  assert.equal(preview.includes('Diagnosebericht'), false);
});

test('explicit details remain visible in a Unicode-safe WhatsApp preview before handoff', () => {
  const preview = buildContactPreview({
    includeDetails: true,
    repairSummary: 'Bremsen prüfen – Geräusch bei Nässe',
    vehicleSummary: 'Škoda Octavia, 2018',
    workshopName: 'Fiktive Werkstatt Pejë',
  });
  const href = buildWhatsAppHref('+383 (44) 123-456', preview);

  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/38344123456');
  assert.equal(url.searchParams.get('text'), preview);
  assert.match(preview, /Škoda/);
  assert.match(preview, /Geräusch/);
  assert.equal(buildTelephoneHref('+383 (44) 123-456'), 'tel:+38344123456');
});

test('invalid public phone values create neither WhatsApp nor telephone links', () => {
  assert.equal(buildTelephoneHref('not-a-phone'), undefined);
  assert.equal(buildWhatsAppHref('not-a-phone', 'Hallo'), undefined);
});
