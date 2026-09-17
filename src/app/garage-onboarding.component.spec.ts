import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { LanguageService } from './language.service';
import { garageManagementCopy } from '../shared/garage-management-copy';

const validForm = {
  name: 'Fiktiver Testbetrieb',
  placeId: 'xk-pristina',
  address: 'Fiktive Straße 12, 10000 Prishtina',
  contactPerson: 'Private Testperson',
  contactPhone: '+99900000001',
  publicPhone: '',
  publicWhatsapp: false,
  languages: ['Deutsch'],
  serviceCategoryIds: ['bremsen'],
  vehicleMakeIds: [],
  selfReportedSpecializations: [],
};
async function setup() {
  await TestBed.configureTestingModule({
    imports: [GarageOnboardingComponent],
    providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: 'server' }],
  }).compileComponents();
  const fixture = TestBed.createComponent(GarageOnboardingComponent);
  fixture.detectChanges();
  return fixture;
}
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'autokosova_csrf=; Max-Age=0; path=/';
});

it('has no fabricated selections and validates an address conflict with focus on the field', async () => {
  const fixture = await setup(),
    component = fixture.componentInstance;
  expect(component['form'].vehicleMakeIds).toEqual([]);
  expect(component['form'].serviceCategoryIds).toEqual([]);
  component['form'] = { ...validForm, address: 'Fiktive Straße 12, Ferizaj' };
  component['consentAccepted'] = true;
  expect(component['validate']()).toBe(false);
  fixture.detectChanges();
  expect(component['errors']['street']).toContain('stimmen nicht überein');
  expect(fixture.nativeElement.querySelector('#garage-street').getAttribute('aria-invalid')).toBe(
    'true',
  );
});

it('uses the same image, overlay, text container and card overlap as the inquiry hero', async () => {
  const fixture = await setup();
  const page = fixture.nativeElement as HTMLElement;
  const hero = page.querySelector<HTMLElement>('header[aria-labelledby="onboarding-hero-title"]')!;
  const image = hero.querySelector<HTMLImageElement>('img')!;
  expect(hero.className).toContain('min-h-68');
  expect(hero.className).toContain('lg:h-68');
  expect(hero.className).toContain('pt-8');
  expect(hero.className).toContain('pb-20');
  expect(image.src).toContain('/images/home/hero-mountain-road-1672.webp');
  expect(image.className).toContain('object-[75%_54%]');
  expect(hero.querySelector('.bg-linear-to-r')).not.toBeNull();
  expect(hero.querySelector('h1')!.className).toContain('max-w-xl');
  expect(hero.querySelector('p')!.className).toBe(
    'mt-3 max-w-xl text-base leading-6 text-white sm:text-lg',
  );
  expect(
    [...hero.querySelectorAll('div')].some((element) => element.className.includes('max-w-340')),
  ).toBe(true);
  expect(page.querySelector<HTMLElement>('header + div')!.className).toContain('-mt-10');
});

it('renders the garage overview with one standard page title and no illustration hero', async () => {
  const fixture = await setup();
  const component = fixture.componentInstance;
  vi.spyOn(component as unknown as { managing: boolean }, 'managing', 'get').mockReturnValue(true);
  component['editing'] = false;
  fixture.detectChanges();

  const page = fixture.nativeElement as HTMLElement;
  const overview = page.querySelector<HTMLElement>('[data-garages-overview]')!;
  expect(overview.querySelectorAll('#workspace-title')).toHaveLength(1);
  expect(page.querySelector('#form-title')).toBeNull();
  const heading = overview.querySelector<HTMLElement>('.garage-management-heading')!;
  expect(heading.className).toContain('my-8');
  expect(overview.querySelector('.garage-management-art')).toBeNull();
  expect(overview.querySelector<HTMLElement>('[data-new-garage]')?.className).toContain('min-h-13');
});

it('sends the address, preserves input on a failed save and prevents a second concurrent request', async () => {
  const fixture = await setup(),
    component = fixture.componentInstance;
  component['form'] = { ...validForm };
  component['consentAccepted'] = true;
  document.cookie = 'autokosova_csrf=test-token; path=/';
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const pending = component['submit']();
  await component['submit']();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(
    JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
      .profile.address,
  ).toBe(validForm.address);
  finish(new Response('{}', { status: 503 }));
  await pending;
  expect(component['form'].address).toBe(validForm.address);
  expect(component['garageId']).toBeUndefined();
  expect(component['message']).toContain('fehlgeschlagen');
});

it('reopens the saved private profile including custom values and treats submission as a separate action', async () => {
  const fixture = await setup(),
    component = fixture.componentInstance;
  const profile = { ...validForm, selfReportedSpecializations: ['Existing custom value'] };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'owned',
          profile,
          publicationState: 'draft',
          consentVersion: 'v1',
          verification: { location: 'not_checked' },
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          garages: [{ id: 'owned', name: profile.name, publicationState: 'pending_review' }],
        }),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  await component['open']('owned');
  expect(component['form']).toEqual(profile);
  expect(
    component['options']('selfReportedSpecializations').some(
      (o) => o.id === 'Existing custom value',
    ),
  ).toBe(true);
  expect(component['locationVerified']).toBe(false);
  expect(component['publicationState']).toBe('draft');
  await component['submitForReview']();
  expect(component['publicationState']).toBe('pending_review');
});

it('keeps entered values on session loss and offers the localized safe return without form data', async () => {
  const fixture = await setup(),
    component = fixture.componentInstance;
  component['form'] = { ...validForm };
  component['consentAccepted'] = true;
  vi.stubGlobal('fetch', vi.fn());
  await component['submit']();
  expect(component['needsLogin']).toBe(true);
  expect(component['form']).toEqual(validForm);
  expect(component['loginUrl']).toBe('/auth/login?returnTo=%2Fgarages%2Fnew');
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['de', 'sq', 'en'] as const)(
  'renders three visually unboxed sections and all searchable selections in %s',
  async (language) => {
    const fixture = await setup();
    const page = fixture.nativeElement as HTMLElement;
    vi.spyOn(TestBed.inject(LanguageService), 'language', 'get').mockReturnValue(language);
    fixture.detectChanges();
    expect(page.querySelectorAll('app-multi-select')).toHaveLength(4);
    expect(page.querySelectorAll('fieldset.onboarding-section')).toHaveLength(3);
    const checkbox = page.querySelector<HTMLInputElement>('input[name="publicWhatsapp"]')!;
    const checkboxLabel = checkbox.closest('label')!;
    expect(getComputedStyle(checkboxLabel).display).toBe('flex');
    expect(getComputedStyle(checkboxLabel).alignItems).toBe('center');
    expect(getComputedStyle(checkbox).width).toBe('20px');
    const title = page.querySelector<HTMLElement>('#form-title')!;
    expect(title.className).toBe('text-3xl font-bold tracking-tight sm:text-[34px]');
    expect(title.nextElementSibling?.className).toBe('mt-1 text-muted');
    expect(title.parentElement?.className).toContain('sm:py-6');
    const infoPanels = page.querySelectorAll<HTMLElement>('aside .info-card');
    expect(infoPanels).toHaveLength(3);
    expect(infoPanels[0].querySelector('h2')!.className).toBe('text-lg font-bold tracking-tight');
    expect(infoPanels[1].querySelector('h2')!.className).toBe('text-lg font-bold tracking-tight');
    expect(infoPanels[0].querySelector('h2 + p')!.className).toBe(
      'mt-2 text-sm leading-relaxed text-slate-500',
    );
    expect(infoPanels[1].querySelector('h2 + p')!.className).toBe(
      'mt-2 text-sm leading-relaxed text-slate-500',
    );
    expect(infoPanels[0].querySelector('ol')!.className).toBe('mt-6 space-y-6');
    expect(infoPanels[1].querySelector('ul')!.className).toBe('mt-6 space-y-6');
    expect(infoPanels[0].querySelector('li')!.className).toBe('flex gap-4');
    expect(infoPanels[1].querySelector('li')!.className).toBe('flex gap-4');
    expect(page.querySelector<HTMLElement>('fieldset.onboarding-section')!.className).not.toContain(
      'rounded',
    );
    expect(page.textContent).not.toContain('durch Komma');
    expect(page.querySelector('app-site-header img')).not.toBeNull();
  },
);

it('uses the localized fallback when an overview timestamp is unavailable', async () => {
  const fixture = await setup();
  const component = fixture.componentInstance;
  expect(component['date'](undefined)).toBe(garageManagementCopy.de.dateUnavailable);
});

it('does not send a delete without ownership, confirmation or a CSRF token', async () => {
  const fixture = await setup();
  const component = fixture.componentInstance;
  component['form'] = { ...validForm };
  component['garageId'] = 'demo-owned';
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  const confirm = vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(false);
  try {
    await component['remove']();
    expect(confirm).not.toHaveBeenCalled();
    component['canDelete'] = true;
    await component['remove']();
    expect(request).not.toHaveBeenCalled();
    expect(component['garageId']).toBe('demo-owned');
    confirm.mockResolvedValue(true);
    await component['remove']();
    expect(request).not.toHaveBeenCalled();
    expect(component['needsLogin']).toBe(true);
  } finally {
    confirm.mockRestore();
  }
});

it('deletes only the selected garage and preserves form data on a failed delete', async () => {
  const fixture = await setup();
  const component = fixture.componentInstance;
  component['form'] = { ...validForm };
  component['garageId'] = 'demo-owned';
  component['canDelete'] = true;
  document.cookie = 'autokosova_csrf=test-csrf; path=/';
  const request = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', request);
  const confirm = vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(true);
  try {
    await component['remove']();
    expect(component['garageId']).toBe('demo-owned');
    expect(component['form'].name).toBe(validForm.name);
    expect(component['sending']).toBe(false);
    request
      .mockReset()
      .mockImplementation(async (url: string) =>
        url === '/api/garages/demo-owned'
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ garages: [] }), { status: 200 }),
      );
    await component['remove']();
    expect(request.mock.calls[0][0]).toBe('/api/garages/demo-owned');
    expect(request.mock.calls[0][1]).toMatchObject({
      method: 'DELETE',
      headers: { 'x-csrf-token': 'test-csrf' },
    });
    expect(component['garageId']).toBeUndefined();
    expect(component['canDelete']).toBe(false);
    expect(component['form'].name).toBe('');
    expect(component['owned']).toEqual([]);
    expect(component['message']).toContain('entfernt');
  } finally {
    confirm.mockRestore();
  }
});
