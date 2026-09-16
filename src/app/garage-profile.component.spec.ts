import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { GarageProfileComponent } from './garage-profile.component';
import { profileCopy } from '../shared/profile-copy';

const profile = {
  contact: { phone: '+383 44 123 456', whatsapp: true },
  description: 'Fiktiver Originaltext der Werkstatt.',
  id: 'fiktive-werkstatt',
  languages: ['Deutsch', 'Shqip'],
  name: 'Fiktive Werkstatt Pejë',
  photoIds: ['photo-a', 'photo-b', 'photo-c', 'photo-d'],
  placeId: 'xk-peja',
  reviewSummary: {
    averageRating: 4.3,
    label: '4.3 von 5 · 1 Bewertung',
    reviewCount: 1,
    state: 'available',
    verifiedVisitCount: 1,
  },
  searchContext: {
    distanceKm: 3.2,
    matchingPlace: { id: 'xk-peja', label: 'Pejë' },
  },
  selfReportedSpecializations: ['Bremsen'],
  serviceCategoryIds: ['bremsen', 'service-inspektion'],
  vehicleMakeIds: ['skoda'],
  verificationLabel: 'Unternehmensdaten geprüft',
} as const;

const review = {
  evidence: { label: 'Besuch belegt', state: 'verified' },
  id: 'review-a',
  ratings: {
    communication: 4,
    overall: 4.3,
    priceTransparency: 4,
    punctuality: 5,
    workQuality: 4,
  },
  serviceCategoryId: 'bremsen',
  text: 'Fiktive veröffentlichte Erfahrung zur ausgeführten Arbeit.',
  updates: [{ createdAt: '2026-09-01', kind: 'rework', text: 'Fiktive Nacharbeit.' }],
  vehicleMakeId: 'skoda',
  visitMonth: '2026-08',
  garageResponse: { createdAt: '2026-09-02', text: 'Fiktive öffentliche Antwort.' },
} as const;

function routeWith(
  garageId: string,
  query: Record<string, string> = {},
  fragment: string | null = null,
) {
  const paramMap = new BehaviorSubject(convertToParamMap({ garageId }));
  return {
    fragment: of(fragment),
    paramMap,
    snapshot: {
      fragment,
      paramMap: convertToParamMap({ garageId }),
      queryParamMap: convertToParamMap(query),
    },
  };
}

function mockPublicRequests(
  profileResponse: unknown = profile,
  reviews: readonly unknown[] = [review],
) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === '/api/me') return new Response('{}', { status: 401 });
    if (url === '/api/session') return new Response(JSON.stringify({ authenticated: false }));
    if (url === '/api/me/favorites') return new Response('{}', { status: 401 });
    if (url.includes('/reviews')) return new Response(JSON.stringify({ reviews }));
    if (url.startsWith('/api/public/garages/'))
      return new Response(JSON.stringify(profileResponse));
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function setup(
  profileResponse: unknown = profile,
  reviews: readonly unknown[] = [review],
  query: Record<string, string> = { places: 'xk-peja:20', symptom: 'PRIVATE' },
  fragment: string | null = null,
) {
  const request = mockPublicRequests(profileResponse, reviews);
  const route = routeWith((profileResponse as typeof profile).id, query, fragment);
  vi.stubGlobal('fetch', request);
  await TestBed.configureTestingModule({
    imports: [GarageProfileComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: route,
      },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GarageProfileComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    component: fixture.componentInstance,
    fixture,
    page: fixture.nativeElement as HTMLElement,
    request,
    route,
  };
}

function contactDialog(): HTMLElement {
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((element) =>
    Boolean(element.querySelector('[data-contact-close]')),
  );
  if (!dialog) throw new Error('Expected the contact dialog to be open.');
  return dialog;
}

afterEach(() => vi.unstubAllGlobals());

describe('GarageProfileComponent', () => {
  it('provides the same complete profile catalog in DE, SQ and EN', () => {
    for (const locale of ['sq', 'en'] as const) {
      expect(Object.keys(profileCopy[locale]).sort()).toEqual(Object.keys(profileCopy.de).sort());
      expect(Object.values(profileCopy[locale]).every((value) => value.trim().length > 0)).toBe(
        true,
      );
    }
  });
  it('renders published facts, a unique photo mosaic and verified review semantics', async () => {
    const { fixture, page, request } = await setup();
    expect(page.textContent).toContain('Fiktive Werkstatt Pejë');
    expect(page.textContent).toContain('Unternehmensdaten geprüft');
    expect(page.textContent).toContain('3,2 km Luftlinie zu Pejë');
    expect(page.textContent).not.toMatch(/Seit 2010|Mitarbeiter|Reparaturgarantie|Altin K/);
    expect(page.querySelectorAll('button').length).toBeGreaterThan(0);
    expect(
      [...page.querySelectorAll('button')].filter((button) =>
        button.textContent?.includes('Kontakt aufnehmen'),
      ),
    ).toHaveLength(2);
    expect(page.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Werkstätten finden',
    );
    expect(page.querySelector('#about')?.className).not.toMatch(/bg-white|shadow-sm|rounded-2xl/);
    expect(page.querySelector('#reviews')).toBeTruthy();
    expect(page.querySelector('#services')).toBeTruthy();
    expect(page.querySelector('#makes')).toBeTruthy();
    expect(page.querySelector('#location')).toBeTruthy();
    expect(
      [...page.querySelectorAll<HTMLImageElement>('#photos img')].map((image) => image.src),
    ).toEqual([
      expect.stringContaining('photo-a'),
      expect.stringContaining('photo-b'),
      expect.stringContaining('photo-c'),
    ]);
    expect(page.textContent).toContain('Alle Fotos anzeigen (4)');
    expect(request).toHaveBeenCalledWith(
      '/api/public/garages/fiktive-werkstatt?places=xk-peja%3A20',
      { credentials: 'same-origin' },
    );

    expect(page.textContent).toContain('Fiktive veröffentlichte Erfahrung');
    expect(page.textContent).toContain('Werkstattbesuch belegt');

    const trigger = page.querySelector<HTMLButtonElement>('#photos button')!;
    trigger.click();
    await fixture.whenStable();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Fotos"]')!;
    const panel = dialog.querySelector<HTMLElement>('section')!;
    const close = dialog.querySelector<HTMLButtonElement>('[data-gallery-close]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(close);
    expect(dialog.querySelector('figcaption')?.textContent).toContain('Foto 1 von 4');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(dialog.querySelector('figcaption')?.textContent).toContain('Foto 2 von 4');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(document.querySelector('[role="dialog"][aria-label="Fotos"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the Brain lightbox on a profile route change without restoring a removed trigger', async () => {
    const { fixture, page, route } = await setup();
    const trigger = page.querySelector<HTMLButtonElement>('#photos button')!;
    trigger.click();
    await fixture.whenStable();
    expect(document.querySelector('[role="dialog"][aria-label="Fotos"]')).toBeTruthy();

    trigger.remove();
    route.paramMap.next(convertToParamMap({ garageId: 'other-garage' }));
    await fixture.whenStable();

    expect(document.querySelector('[role="dialog"][aria-label="Fotos"]')).toBeNull();
    expect(document.activeElement).toBe(page.querySelector('[data-gallery-fallback]'));
  });

  it.each([1, 2])('renders each of %s published photos once without duplication', async (count) => {
    const photos = profile.photoIds.slice(0, count);
    const { page } = await setup({ ...profile, photoIds: photos }, []);
    const sources = [...page.querySelectorAll<HTMLImageElement>('#photos img')].map((image) =>
      image.getAttribute('src'),
    );
    expect(sources).toEqual(
      photos.map((photoId) => `/api/public/garages/fiktive-werkstatt/photos/${photoId}`),
    );
    expect(new Set(sources).size).toBe(count);
  });

  it('offers a guest sign-in without requesting the private favorites endpoint', async () => {
    const { fixture, page, request } = await setup();
    const favorite = page.querySelector<HTMLButtonElement>(
      'button[aria-label="Fiktive Werkstatt Pejë als Favorit speichern"]',
    )!;
    favorite.click();
    await fixture.whenStable();
    expect(page.textContent).toContain('Favorit speichern?');
    expect(page.querySelector('a[href^="/auth/login"]')).toBeTruthy();
    expect(request.mock.calls.some(([url]) => String(url).startsWith('/api/me/'))).toBe(false);
  });

  it('opens the Brain contact dialog with a named description and no redundant dialog role', async () => {
    const { fixture, page } = await setup();
    const contact = [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Kontakt aufnehmen'),
    )!;
    contact.click();
    await fixture.whenStable();
    const dialog = contactDialog();
    expect(dialog.textContent).toContain('Kontakt zu Fiktive Werkstatt Pejë');
    expect(dialog.textContent).toContain('AutoKosova sendet keine Nachricht');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('contact-dialog-title');
    expect(dialog.getAttribute('aria-describedby')).toMatch(/^brn-dialog-description-/);
    expect(dialog.querySelector('h2')?.id).toMatch(/^brn-dialog-title-/);
    expect(dialog.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(dialog.querySelector('[data-contact-close]'));
    const whatsApp = dialog.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')!;
    expect(whatsApp).toBeTruthy();
    expect(decodeURIComponent(whatsApp.href)).not.toContain('PRIVATE');
    expect(dialog.querySelector('a[href^="tel:+38344123456"]')).toBeTruthy();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(
      [...document.querySelectorAll('[role="dialog"]')].some((element) =>
        element.querySelector('[data-contact-close]'),
      ),
    ).toBe(false);
    expect(document.activeElement).toBe(contact);
  });

  it('keeps contact drafts across close and reopen without contacting a garage', async () => {
    const { fixture, page } = await setup();
    const contact = [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Kontakt aufnehmen'),
    )!;
    contact.click();
    await fixture.whenStable();
    const dialog = contactDialog();
    const details = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    details.click();
    await fixture.whenStable();
    const vehicle = dialog.querySelector<HTMLInputElement>('input[maxlength="120"]')!;
    const concern = dialog.querySelector<HTMLTextAreaElement>('textarea[maxlength="500"]')!;
    vehicle.value = 'Škoda Octavia';
    vehicle.dispatchEvent(new Event('input', { bubbles: true }));
    concern.value = 'Bremsen prüfen';
    concern.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();

    const preview = dialog.querySelector<HTMLTextAreaElement>('textarea[readonly]')!;
    expect(preview.value).toContain('Škoda Octavia');
    expect(preview.value).toContain('Bremsen prüfen');
    expect(vehicle.maxLength).toBe(120);
    expect(concern.maxLength).toBe(500);

    dialog.querySelector<HTMLButtonElement>('[data-contact-close]')!.click();
    await fixture.whenStable();
    contact.click();
    await fixture.whenStable();
    const reopened = contactDialog();
    expect(reopened.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(reopened.querySelector<HTMLInputElement>('input[maxlength="120"]')!.value).toBe(
      'Škoda Octavia',
    );
    expect(reopened.querySelector<HTMLTextAreaElement>('textarea[maxlength="500"]')!.value).toBe(
      'Bremsen prüfen',
    );
  });

  it('restores focus to either contact CTA and uses the profile fallback after a route switch', async () => {
    const { fixture, page, route } = await setup();
    const contacts = [...page.querySelectorAll<HTMLButtonElement>('[data-contact-open]')];
    expect(contacts).toHaveLength(2);
    for (const contact of contacts) {
      contact.click();
      await fixture.whenStable();
      expect(document.activeElement).toBe(contactDialog().querySelector('[data-contact-close]'));
      contactDialog().querySelector<HTMLButtonElement>('[data-contact-close]')!.click();
      await fixture.whenStable();
      expect(document.activeElement).toBe(contact);
    }

    const removedTrigger = contacts[0]!;
    removedTrigger.click();
    await fixture.whenStable();
    removedTrigger.remove();
    route.paramMap.next(convertToParamMap({ garageId: 'other-garage' }));
    await fixture.whenStable();

    expect(
      [...document.querySelectorAll('[role="dialog"]')].some((element) =>
        element.querySelector('[data-contact-close]'),
      ),
    ).toBe(false);
    expect(document.activeElement).toBe(page.querySelector('[data-gallery-fallback]'));
  });

  it('shares only the canonical public URL and provides a copy fallback', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    const { component, fixture, page } = await setup();
    await component['shareProfile']();
    await fixture.whenStable();
    const dialog = page.querySelector<HTMLElement>('[aria-labelledby="share-dialog-title"]')!;
    const value = dialog.querySelector<HTMLInputElement>('input')!.value;
    expect(value).toMatch(/\/garages\/fiktive-werkstatt$/);
    expect(value).not.toMatch(/places|symptom|PRIVATE/);
    await component['copyShareUrl']();
    expect(clipboard.writeText).toHaveBeenCalledWith(value);
    expect(component['shareState']()).toBe('copied');
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await component['copyShareUrl']();
    expect(component['shareState']()).toBe('error');
    const input = dialog.querySelector<HTMLInputElement>('input')!;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(value.length);
  });

  it('uses honest empty states and withholds invalid external contact links', async () => {
    const empty = {
      ...profile,
      contact: { phone: 'not-a-phone' },
      description: undefined,
      photoIds: [],
      reviewSummary: {
        label: 'Noch keine Bewertungen',
        reviewCount: 0,
        state: 'unavailable',
        verifiedVisitCount: 0,
      },
      searchContext: undefined,
      selfReportedSpecializations: [],
      vehicleMakeIds: [],
      verificationLabel: undefined,
    };
    const { fixture, page } = await setup(empty, [], {});
    expect(page.textContent).toContain('Noch keine Fotos veröffentlicht');
    expect(page.textContent).toContain('Noch keine Bewertungen');
    expect(page.textContent).not.toContain('Unternehmensdaten geprüft');
    expect(page.textContent).toContain('Alle Marken');
    expect(page.textContent).toContain('Keine Markenbeschränkung veröffentlicht');
    const contact = [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Kontakt aufnehmen'),
    )!;
    contact.click();
    await fixture.whenStable();
    const dialog = contactDialog();
    expect(dialog.textContent).toContain('Keine gültige öffentliche Telefonnummer');
    expect(dialog.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    expect(dialog.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('offers phone without assuming that every public number supports WhatsApp', async () => {
    const phoneOnly = { ...profile, contact: { phone: '+383 44 123 456' } };
    const { fixture, page } = await setup(phoneOnly, []);
    const contact = [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Kontakt aufnehmen'),
    )!;
    contact.click();
    await fixture.whenStable();
    const dialog = contactDialog();
    expect(dialog.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    expect(dialog.querySelector('a[href^="tel:+38344123456"]')).toBeTruthy();
  });

  it('shows an unavailable state for a missing or blocked profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input) === '/api/session'
          ? new Response(JSON.stringify({ authenticated: false }))
          : new Response('{}', { status: 404 }),
      ),
    );
    await TestBed.configureTestingModule({
      imports: [GarageProfileComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeWith('missing') },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GarageProfileComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Werkstattprofil nicht verfügbar');
    expect(document.querySelector('[data-contact-close]')).toBeNull();
  });

  it('keeps local demo links inspectable but prevents external handover', async () => {
    const demo = { ...profile, id: 'demo-prishtina-bremsen', name: 'DEMO · Bremsen Prishtina' };
    const { fixture, page } = await setup(demo, []);
    const contact = [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Kontakt aufnehmen'),
    )!;
    contact.click();
    await fixture.whenStable();
    const dialog = contactDialog();
    const whatsApp = dialog.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')!;
    const telephone = dialog.querySelector<HTMLAnchorElement>('a[href^="tel:"]')!;
    expect(dialog.textContent).toContain('Lokale Demo');
    expect(
      whatsApp.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
    ).toBe(false);
    expect(
      telephone.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
    ).toBe(false);
  });

  it('keeps public search context in back and login paths but strips unknown parameters', async () => {
    const { component } = await setup();
    expect(component['backQueryParams']()).toEqual({ places: 'xk-peja:20' });
    const login = decodeURIComponent(component['favoriteLoginUrl']());
    expect(login).toContain('/garages/fiktive-werkstatt?places=xk-peja%3A20');
    expect(login).not.toContain('PRIVATE');
  });

  it('uses a routeable review anchor without rendering a tab interface', async () => {
    const { page } = await setup();
    const reviews = page.querySelector<HTMLAnchorElement>('a[href$="#reviews"]')!;
    expect(reviews.getAttribute('href')).toContain('/garages/fiktive-werkstatt');
    expect(reviews.getAttribute('href')).toContain('places=xk-peja:20');
    expect(page.querySelector('[data-profile-section]')).toBeNull();
    expect(page.querySelectorAll('#photos')).toHaveLength(1);
  });

  it('uses a published demo photo as the local demo profile image', async () => {
    const demo = { ...profile, id: 'demo-prishtina-bremsen' };
    const { page } = await setup(demo, []);
    const profileImage = page.querySelector<HTMLImageElement>('section.mt-2 img.rounded-full');
    expect(profileImage?.src).toContain('/api/public/garages/demo-prishtina-bremsen/photos/');
  });

  it.each(['sq', 'en'])('keeps the redesigned profile localized for %s', async (locale) => {
    await TestBed.configureTestingModule({
      imports: [GarageProfileComponent],
      providers: [
        provideRouter([{ path: `${locale}/garages/:garageId`, component: GarageProfileComponent }]),
        { provide: ActivatedRoute, useValue: routeWith('fiktive-werkstatt') },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    }).compileComponents();
    await TestBed.inject(Router).navigateByUrl(`/${locale}/garages/fiktive-werkstatt`);
    const fixture = TestBed.createComponent(GarageProfileComponent);
    fixture.componentInstance['profile'] = profile;
    fixture.componentInstance['state'] = 'ready';
    fixture.componentInstance['reviewState'] = 'ready';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toMatch(/profile\.ui\./);
    expect(fixture.nativeElement.textContent).toContain(
      locale === 'sq' ? 'Rreth nesh' : 'About us',
    );
  });
});
