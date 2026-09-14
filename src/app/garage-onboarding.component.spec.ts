import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { LanguageService } from './language.service';

const validForm = {
  name: 'Fiktiver Testbetrieb',
  placeId: 'xk-pristina',
  address: 'Fiktive Straße 12, 10000 Prishtina',
  contactPerson: 'Private Testperson',
  contactPhone: '+99900000001',
  publicPhone: '',
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
  expect(hero.className).toContain('min-h-[272px]');
  expect(hero.className).toContain('lg:h-[272px]');
  expect(hero.className).toContain('pt-8');
  expect(hero.className).toContain('pb-20');
  expect(image.src).toContain('/images/home/hero-mountain-road-1672.webp');
  expect(image.className).toContain('object-[75%_54%]');
  expect(hero.querySelector('.bg-gradient-to-r')).not.toBeNull();
  expect(
    [...hero.querySelectorAll('div')].some((element) =>
      element.className.includes('max-w-[1360px]'),
    ),
  ).toBe(true);
  expect(page.querySelector<HTMLElement>('header + div')!.className).toContain('-mt-10');
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
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
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
    vi.spyOn(TestBed.inject(LanguageService), 'language', 'get').mockReturnValue(language);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-multi-select')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('fieldset.onboarding-section')).toHaveLength(3);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        'fieldset.onboarding-section',
      )!.className,
    ).not.toContain('rounded');
    expect(fixture.nativeElement.textContent).not.toContain('durch Komma');
    expect(fixture.nativeElement.querySelector('app-site-header img')).not.toBeNull();
  },
);
