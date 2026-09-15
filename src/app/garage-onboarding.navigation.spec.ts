import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { LanguageService } from './language.service';

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

function savedGarage(component: GarageOnboardingComponent): void {
  component['form'] = structuredClone(validForm);
  component['garageId'] = 'owned';
  component['consentAccepted'] = true;
  component['savedSnapshot'] = JSON.stringify(component['form']);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.cookie = 'autokosova_csrf=; Max-Age=0; path=/';
});

it('does not warn for an untouched, loaded or explicitly reset form', async () => {
  const component = (await setup()).componentInstance;
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  expect(component.canLeave()).toBe(true);
  savedGarage(component);
  expect(component.canLeave()).toBe(true);
  component['reset']();
  expect(component['garageId']).toBeUndefined();
  expect(component.canLeave()).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
});

it.each([
  { field: 'name', patch: { name: 'Fiktiver Betrieb' } },
  { field: 'address', patch: { address: 'Fiktive Straße 12' } },
  { field: 'place', patch: { placeId: 'xk-pristina' } },
  { field: 'contact person', patch: { contactPerson: 'Testperson' } },
  { field: 'private phone', patch: { contactPhone: '+99900000001' } },
  { field: 'public phone', patch: { publicPhone: '+99900000002' } },
  { field: 'WhatsApp choice', patch: { publicWhatsapp: true } },
  { field: 'languages', patch: { languages: ['Deutsch'] } },
  { field: 'services', patch: { serviceCategoryIds: ['bremsen'] } },
  { field: 'vehicle makes', patch: { vehicleMakeIds: ['skoda'] } },
  { field: 'specializations', patch: { selfReportedSpecializations: ['Testwert'] } },
])('protects an isolated $field edit when switching or resetting', async ({ patch }) => {
  const component = (await setup()).componentInstance;
  Object.assign(component['form'], patch);
  const before = structuredClone(component['form']);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await component['open']('another');
  component['reset']();
  expect(component['form']).toEqual(before);
  expect(component['garageId']).toBeUndefined();
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('protects consent on a new draft and clears it only after confirmation', async () => {
  const component = (await setup()).componentInstance;
  component['consentAccepted'] = true;
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  component['reset']();
  expect(component['consentAccepted']).toBe(true);
  confirm.mockReturnValue(true);
  component['reset']();
  expect(component['consentAccepted']).toBe(false);
  expect(component.canLeave()).toBe(true);
});

it.each(['de', 'sq', 'en'] as const)(
  'protects the localized %s route using the existing discard copy',
  async (language) => {
    const component = (await setup()).componentInstance;
    vi.spyOn(TestBed.inject(LanguageService), 'language', 'get').mockReturnValue(language);
    component['form'].contactPhone = '+99900000001';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const path = `${language === 'de' ? '' : language + '/'}garages/new`;
    const guard = routes.find((route) => route.path === path)?.canDeactivate?.[0] as (
      value: GarageOnboardingComponent | null,
    ) => boolean;
    expect(guard).toBeTypeOf('function');
    expect(guard(component)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(component['copy'].discard);
    confirm.mockReturnValue(true);
    expect(guard(component)).toBe(true);
    expect(guard(null)).toBe(true);
  },
);

it('registers an unload warning only while work is unsaved or in flight', async () => {
  const fixture = await setup();
  const component = fixture.componentInstance;
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  component['form'].contactPhone = '+99900000001';
  const dirty = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  savedGarage(component);
  const saved = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
  component['sending'] = true;
  const pending = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  fixture.destroy();
  const destroyed = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(destroyed);
  expect(destroyed.defaultPrevented).toBe(false);
});

it.each(['sending', 'loading'] as const)(
  'blocks navigation, reset, profile switching and review while %s',
  async (state) => {
    const component = (await setup()).componentInstance;
    savedGarage(component);
    component[state] = true;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(component.canLeave()).toBe(false);
    component['reset']();
    await component['open']('another');
    await component['submitForReview']();
    expect(component['garageId']).toBe('owned');
    expect(component['form']).toEqual(validForm);
    expect(confirm).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it('keeps edits and the unsaved warning when opening another profile fails', async () => {
  const component = (await setup()).componentInstance;
  savedGarage(component);
  component['form'].contactPhone = '+99900000003';
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
  await component['open']('another');
  expect(component['garageId']).toBe('owned');
  expect(component['form'].contactPhone).toBe('+99900000003');
  expect(component['loading']).toBe(false);
  confirm.mockReturnValue(false);
  expect(component.canLeave()).toBe(false);
});

it('clears the warning only after a successful save', async () => {
  const component = (await setup()).componentInstance;
  component['form'] = structuredClone(validForm);
  component['consentAccepted'] = true;
  document.cookie = 'autokosova_csrf=test-token; path=/';
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'owned' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ garages: [] })));
  vi.stubGlobal('fetch', fetchMock);
  await component['submit']();
  expect(component.canLeave()).toBe(false);
  await component['submit']();
  confirm.mockClear();
  expect(component['garageId']).toBe('owned');
  expect(component.canLeave()).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
});

it.each([401, 403])('offers reauthentication after review returns %s without losing data', async (status) => {
  const component = (await setup()).componentInstance;
  savedGarage(component);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
  await component['submitForReview']();
  expect(component['needsLogin']).toBe(true);
  expect(component['message']).toBe(component['copy'].signIn);
  expect(component['publicationState']).toBe('draft');
  expect(component['form']).toEqual(validForm);
  expect(component['sending']).toBe(false);
});

it.each(['published', 'pending_review', 'suspended'] as const)(
  'does not send an invalid review transition from %s',
  async (state) => {
    const component = (await setup()).componentInstance;
    savedGarage(component);
    component['publicationState'] = state;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await component['submitForReview']();
    expect(component['publicationState']).toBe(state);
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
