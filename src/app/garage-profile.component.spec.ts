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

function shareDialog(): HTMLElement {
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((element) =>
    Boolean(element.querySelector('[data-share-url]')),
  );
  if (!dialog) throw new Error('Expected the share dialog to be open.');
  return dialog;
}

function reviewFilterTrigger(page: HTMLElement): HTMLButtonElement {
  const trigger = [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Bewertungen filtern'),
  );
  if (!trigger) throw new Error('Expected the review filter trigger.');
  return trigger;
}

function reviewFilterGroup(): HTMLElement {
  const group = document.querySelector<HTMLElement>(
    '[role="group"][aria-label="Bewertungen filtern"]',
  );
  if (!group) throw new Error('Expected the review filter portal.');
  return group;
}

function setNativeShare(share: ((data: ShareData) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
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

  it('keeps successful and cancelled native sharing outside the fallback', async () => {
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    setNativeShare(nativeShare);
    const { fixture, page } = await setup();
    const trigger = page.querySelector<HTMLButtonElement>('[data-share-open]')!;

    trigger.click();
    await fixture.whenStable();

    expect(nativeShare).toHaveBeenCalledWith({
      title: profile.name,
      url: expect.stringMatching(/\/garages\/fiktive-werkstatt$/),
    });
    expect(document.querySelector('[data-share-url]')).toBeNull();

    setNativeShare(vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));
    trigger.click();
    await fixture.whenStable();

    expect(document.querySelector('[data-share-url]')).toBeNull();
  });

  it('opens one named Brain fallback for unavailable or failed native sharing', async () => {
    setNativeShare(undefined);
    const { component, fixture, page } = await setup();
    const trigger = page.querySelector<HTMLButtonElement>('[data-share-open]')!;

    trigger.click();
    await fixture.whenStable();

    const dialog = shareDialog();
    const panel = dialog.querySelector<HTMLElement>('section')!;
    const input = dialog.querySelector<HTMLInputElement>('[data-share-url]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('share-dialog-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('share-dialog-description');
    expect(input.getAttribute('aria-label')).toBe('Öffentliche Profiladresse');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(panel.className).toContain('w-[calc(100vw-32px)]');
    expect(panel.className).toContain('max-w-lg');
    expect(panel.className).toContain('rounded-2xl');
    expect(panel.className).toContain('bg-white');
    expect(panel.className).toContain('p-5');
    expect(panel.className).toContain('shadow-2xl');
    expect(dialog.querySelector('.mt-5.flex.flex-col.gap-3.sm\\:flex-row')).toBeTruthy();

    await component['shareProfile']();
    await fixture.whenStable();
    expect(
      [...document.querySelectorAll('[role="dialog"]')].filter((element) =>
        element.querySelector('[data-share-url]'),
      ),
    ).toHaveLength(1);

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(document.querySelector('[data-share-url]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    const nativeShare = vi.fn().mockRejectedValue(new Error('not available'));
    setNativeShare(nativeShare);
    trigger.click();
    await fixture.whenStable();
    expect(nativeShare).toHaveBeenCalledOnce();
    expect(shareDialog()).toBeTruthy();

    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await fixture.whenStable();
    expect(document.querySelector('[data-share-url]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('shares only the canonical public URL and provides an honest copy fallback', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    setNativeShare(undefined);
    const { fixture, page } = await setup();
    page.querySelector<HTMLButtonElement>('[data-share-open]')!.click();
    await fixture.whenStable();
    const dialog = shareDialog();
    const value = dialog.querySelector<HTMLInputElement>('input')!.value;
    expect(value).toMatch(/\/garages\/fiktive-werkstatt$/);
    expect(value).not.toMatch(/places|symptom|PRIVATE/);
    dialog.querySelector<HTMLButtonElement>('button[appButton]')!.click();
    await fixture.whenStable();
    expect(clipboard.writeText).toHaveBeenCalledWith(value);
    expect(dialog.querySelector('[role="status"]')?.textContent).toContain('Link kopiert.');
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    dialog.querySelector<HTMLButtonElement>('button[appButton]')!.click();
    await fixture.whenStable();
    expect(dialog.querySelector('[role="status"]')?.textContent).toContain(
      'Kopiere den markierten Link manuell.',
    );
    const input = dialog.querySelector<HTMLInputElement>('input')!;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(value.length);
  });

  it('ignores late native-share results after a profile change', async () => {
    let resolveShare!: () => void;
    const nativeShare = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveShare = resolve;
        }),
    );
    setNativeShare(nativeShare);
    const first = await setup();
    const pendingRouteShare = first.component['shareProfile']();
    await Promise.resolve();
    expect(nativeShare).toHaveBeenCalledOnce();

    first.route.paramMap.next(convertToParamMap({ garageId: 'other-garage' }));
    resolveShare();
    await pendingRouteShare;
    await first.fixture.whenStable();
    expect(document.querySelector('[data-share-url]')).toBeNull();
    expect(first.component['shareOpen']()).toBe(false);
  });

  it('ignores late native-share results after destroy', async () => {
    let resolveDestroyedShare!: () => void;
    setNativeShare(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDestroyedShare = resolve;
          }),
      ),
    );
    const second = await setup();
    const pendingDestroyedShare = second.component['shareProfile']();
    await Promise.resolve();
    second.fixture.destroy();
    resolveDestroyedShare();
    await pendingDestroyedShare;
    expect(second.component['shareOpen']()).toBe(false);
    expect(document.querySelector('[data-share-url]')).toBeNull();
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

  it('uses the Brain trigger and portal for a nonmodal native review filter', async () => {
    const { component, fixture, page } = await setup();
    const trigger = reviewFilterTrigger(page);

    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await fixture.whenStable();

    const group = reviewFilterGroup();
    const controls = trigger.getAttribute('aria-controls');
    const service = group.querySelector<HTMLSelectElement>('select')!;
    const make = group.querySelectorAll<HTMLSelectElement>('select')[1]!;
    expect(component['reviewFiltersState']()).toBe('open');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)?.contains(group)).toBe(true);
    expect(group.closest('[role="dialog"], [role="menu"], [role="listbox"]')).toBeNull();
    expect(group.className).toContain('w-[min(20rem,calc(100vw-3rem))]');
    expect(group.className).toContain(
      'gap-3 rounded-xl border border-blue-100 bg-white p-4 text-ink shadow-xl',
    );
    expect(document.activeElement).toBe(service);

    const nativeSelectArrow = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
    });
    service.dispatchEvent(nativeSelectArrow);
    expect(nativeSelectArrow.defaultPrevented).toBe(false);
    expect(make.getAttribute('role')).toBeNull();

    group.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(document.querySelector('[role="group"][aria-label="Bewertungen filtern"]')).toBeNull();
    expect(component['reviewFiltersState']()).toBe('closed');
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    await fixture.whenStable();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(document.querySelector('[role="group"][aria-label="Bewertungen filtern"]')).toBeNull();
    expect(component['reviewFiltersState']()).toBe('closed');
    expect(document.activeElement).toBe(trigger);
  });

  it('changes review signals locally and only loads once after explicit apply', async () => {
    const { component, fixture, page, request } = await setup();
    const trigger = reviewFilterTrigger(page);
    request.mockClear();
    trigger.click();
    await fixture.whenStable();
    const [service, make] = reviewFilterGroup().querySelectorAll<HTMLSelectElement>('select');
    service.value = 'bremsen';
    service.dispatchEvent(new Event('change', { bubbles: true }));
    make.value = 'skoda';
    make.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();

    expect(component['reviewServiceCategoryId']()).toBe('bremsen');
    expect(component['reviewVehicleMakeId']()).toBe('skoda');
    expect(request).not.toHaveBeenCalled();
    reviewFilterGroup().querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();

    expect(component['reviewFiltersState']()).toBe('closed');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      '/api/public/garages/fiktive-werkstatt/reviews?page=1&serviceCategoryId=bremsen&vehicleMakeId=skoda',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('closes the filter before its dirty confirmation and cancels without a reload', async () => {
    const { component, fixture, page, request } = await setup();
    component['contributionDirty']('review-a', true);
    request.mockClear();
    reviewFilterTrigger(page).click();
    await fixture.whenStable();
    reviewFilterGroup().querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();

    const confirmation = document.querySelector<HTMLElement>('[data-confirmation-dialog]')!;
    expect(document.querySelector('[role="group"][aria-label="Bewertungen filtern"]')).toBeNull();
    expect(document.activeElement).toBe(
      confirmation.querySelector<HTMLButtonElement>('[data-confirmation-cancel]'),
    );
    confirmation.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();

    expect(request).not.toHaveBeenCalled();
    expect(component['reviewState']).toBe('ready');
  });

  it('awaits the dirty guard for pagination and loads exactly once after acceptance', async () => {
    const { component, request } = await setup();
    component['contributionDirty']('review-a', true);
    const confirm = vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(false);
    request.mockClear();

    await component['reviewPageChanged'](2);
    expect(confirm).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();

    confirm.mockReset();
    confirm.mockResolvedValue(true);
    await component['reviewPageChanged'](2);
    expect(confirm).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe('/api/public/garages/fiktive-werkstatt/reviews?page=2');
  });

  it('aborts and ignores a stale review response when the profile route changes', async () => {
    const { component, route } = await setup();
    const initialReviewId = component['reviews'][0]?.id;
    let resolveReview!: (response: Response) => void;
    const request = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      void init;
      if (String(input).includes('/reviews')) {
        return new Promise<Response>((resolve) => (resolveReview = resolve));
      }
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', request);

    const loading = component['loadReviews']();
    await Promise.resolve();
    const signal = request.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal).toBeTruthy();
    component['reviewFiltersState'].set('open');
    route.paramMap.next(convertToParamMap({ garageId: 'other-garage' }));
    expect(signal.aborted).toBe(true);
    expect(component['reviewFiltersState']()).toBe('closed');

    resolveReview(new Response(JSON.stringify({ reviews: [{ ...review, id: 'stale-review' }] })));
    await loading;
    expect(component['reviews'][0]?.id).toBe(initialReviewId);
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
