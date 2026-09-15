import { SiteHeaderComponent } from './site-header.component';
import { By } from '@angular/platform-browser';
import { SearchAreasComponent } from './ui/search-areas.component';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RepairRequestComponent } from './repair-request.component';
import { RepairRequestDraft } from './repair-request-draft';

const travel = {
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  serviceCategoryId: 'bremsen',
  areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
};

async function setup(stored?: Record<string, unknown>, locale = '') {
  const draft = { read: () => stored, write: vi.fn(), clear: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [RepairRequestComponent],
    providers: [
      provideRouter([{ path: '**', component: RepairRequestComponent }]),
      { provide: RepairRequestDraft, useValue: draft },
    ],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(`/${locale ? locale + '/' : ''}inquiry`);
  const fixture = TestBed.createComponent(RepairRequestComponent);
  await fixture.whenStable();
  return {
    fixture,
    component: fixture.componentInstance,
    page: fixture.nativeElement as HTMLElement,
    draft,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Five-step private repair request', () => {
  it('allows no vehicle details, validates dates and retains values and local files on back navigation', async () => {
    const { component, fixture, page } = await setup();
    expect(page.querySelectorAll('ol li')).toHaveLength(5);
    component['next']();
    expect(component['step']).toBe(2);
    component['next']();
    expect(component['step']).toBe(2);
    component['form'].patchValue({ ...travel, symptom: 'Fiktiver Hinweis' });
    component['next']();
    fixture.detectChanges();
    expect(page.querySelectorAll('input[type="date"]')).toHaveLength(2);
    component['form'].controls.latestPickupOn.setValue('2026-10-01');
    component['next']();
    expect(component['step']).toBe(3);
    component['form'].controls.latestPickupOn.setValue(travel.latestPickupOn);
    component['next']();
    const file = new File(['fictional'], 'demo.pdf', { type: 'application/pdf' });
    component['onFilesSelected']({
      target: { files: [file], value: 'demo.pdf' },
    } as unknown as Event);
    component['next']();
    await fixture.whenStable();
    expect(component['step']).toBe(5);
    expect(page.querySelector('[aria-current="step"]')?.textContent).toContain('Fertig');
    expect(page.textContent).toContain('nicht hochgeladen oder mitgespeichert');
    component['previous']();
    component['previous']();
    expect(component['selectedFiles']).toEqual([file]);
    expect(component['form'].getRawValue().symptom).toBe('Fiktiver Hinweis');
    expect(component['form'].getRawValue().areas).toEqual(travel.areas);
  });

  it('restores all three areas and optional fields, accepts class-only and rejects out-of-range vehicle values', async () => {
    const areas = [
      ...travel.areas,
      { placeId: 'xk-prizren', radiusKm: 30 },
      { placeId: 'xk-peja', radiusKm: 50 },
    ];
    const { component } = await setup({
      ...travel,
      areas,
      vehicle: { vehicleClass: 'suv', fuel: 'diesel' },
    });
    expect(component['areas'].value.length).toBe(3);
    component['next']();
    expect(component['step']).toBe(2);
    component['previous']();
    component['form'].controls.vehicle.patchValue({ year: '1800', mileageKm: '2000001' });
    component['next']();
    expect(component['step']).toBe(1);
    component['form'].controls.vehicle.patchValue({ year: '', mileageKm: '0' });
    component['next']();
    expect(component['step']).toBe(2);
    expect(component['form'].getRawValue().areas).toEqual(areas);
  });

  it('offers transmission choices and preserves both selected and older draft values', async () => {
    const { component, page, fixture } = await setup({
      vehicle: { transmissionDetails: 'Legacy manual gearbox' },
    });
    const select = page.querySelector<HTMLSelectElement>(
      'select[formControlName="transmissionDetails"]',
    )!;
    expect(select.value).toBe('Legacy manual gearbox');
    select.value = 'automatic';
    select.dispatchEvent(new Event('change'));
    component['next']();
    component['previous']();
    await fixture.whenStable();
    expect(component['form'].getRawValue().vehicle.transmissionDetails).toBe('automatic');
    expect(component['vehicleSummary']()).toContain('Automatik');
    expect(
      page.querySelector<HTMLSelectElement>('select[formControlName="transmissionDetails"]')?.value,
    ).toBe('automatic');
  });

  it('rejects duplicate places, fractional radii, invalid calendar dates and invalid files', async () => {
    const { component } = await setup(travel);
    component['next']();
    component['next']();
    component['areas'].setValue([...travel.areas, ...travel.areas]);
    component['next']();
    expect(component['step']).toBe(3);
    component['areas'].setValue([{ placeId: 'xk-pristina', radiusKm: 5.5 }]);
    component['next']();
    expect(component['step']).toBe(3);
    component['areas'].setValue(travel.areas);
    component['form'].controls.latestPickupOn.setValue('2026-02-30');
    component['next']();
    expect(component['step']).toBe(3);
    component['onFilesSelected']({
      target: {
        files: [new File(['x'], 'demo.exe', { type: 'application/octet-stream' })],
        value: '',
      },
    } as unknown as Event);
    expect(component['selectedFiles']).toHaveLength(0);
    expect(component['fileError']).toBeTruthy();
  });

  it('hands only approved filters to guest search and retains the browser draft', async () => {
    const { component, draft } = await setup({
      ...travel,
      symptom: 'PRIVATE',
      vehicle: { vehicleClass: 'car', model: 'PRIVATE', fuel: 'petrol' },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component['search']();
    const url = new URL(navigate.mock.calls[0][0] as string, 'http://localhost');
    expect([...url.searchParams.keys()].sort()).toEqual(['places', 'service']);
    expect(url.href).not.toContain('PRIVATE');
    expect(draft.clear).not.toHaveBeenCalled();
  });

  it.each([401, 500, 'network'])(
    'keeps the draft and never claims success on %s',
    async (failure) => {
      const { component, draft } = await setup(travel);
      vi.stubGlobal(
        'fetch',
        failure === 'network'
          ? vi.fn().mockRejectedValue(new Error('offline'))
          : vi.fn().mockResolvedValue({ status: failure, ok: false }),
      );
      await component['savePrivately']();
      expect(component['saved']).toBe(false);
      expect(component['saving']).toBe(false);
      expect(component['statusMessage']).toBeTruthy();
      expect(draft.clear).not.toHaveBeenCalled();
    },
  );

  it('updates the rendered save failure and re-enables actions after an asynchronous response', async () => {
    const { component, fixture, page } = await setup(travel);
    for (let index = 1; index < 5; index++) component['next']();
    fixture.detectChanges();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
    const save = [...page.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Entwurf privat speichern'),
    )!;
    save.click();
    await fixture.whenStable();
    expect(page.textContent).toContain('Bitte melde dich zum dauerhaften Speichern an.');
    expect(save.disabled).toBe(false);
    expect(page.querySelector('fieldset[disabled]')).toBeNull();
  });

  it('saves optional fields once, shows actual success and excludes locally selected files', async () => {
    const { component, draft } = await setup({
      ...travel,
      vehicle: { vehicleClass: 'camper', fuel: 'diesel' },
    });
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetch);
    component['selectedFiles'] = [new File(['fictional'], 'demo.pdf')];
    await component['savePrivately']();
    await component['savePrivately']();
    expect(fetch).toHaveBeenCalledTimes(1);
    const input = JSON.parse(fetch.mock.calls[0][1].body);
    expect(input.vehicle).toEqual({ vehicleClass: 'camper', fuel: 'diesel' });
    expect(input.attachmentIds).toBeUndefined();
    expect(component['saved']).toBe(true);
    expect(draft.clear).toHaveBeenCalledOnce();
    component['form'].controls.symptom.setValue('Changed');
    expect(component['saved']).toBe(false);
  });

  it.each(['sq', 'en'])(
    'localizes all steps and preserves the login return path for %s',
    async (locale) => {
      const { component, page, fixture } = await setup(travel, locale);
      expect(page.textContent).not.toContain('Warum AutoKosova');
      for (let index = 1; index < 5; index++) component['next']();
      await fixture.whenStable();
      expect(component['step']).toBe(5);
      expect(page.textContent).not.toContain('Entwurf privat speichern');
      expect(component['loginUrl']()).toContain(encodeURIComponent(`/${locale}/inquiry`));
    },
  );
});

it('binds the shared location editor to the private draft only after confirmation and permits all of Kosovo without a location', async () => {
  const { component, fixture, page, draft } = await setup(travel);
  component['next']();
  component['next']();
  await fixture.whenStable();
  let editor = fixture.debugElement.query(By.directive(SearchAreasComponent))
    .componentInstance as SearchAreasComponent;
  draft.write.mockClear();
  editor['editArea'](0);
  await fixture.whenStable();
  const select = page.querySelector<HTMLSelectElement>('#inquiry-area-place')!;
  select.value = 'xk-prizren';
  select.dispatchEvent(new Event('change'));
  await fixture.whenStable();
  expect(component['form'].getRawValue().areas).toEqual(travel.areas);
  expect(draft.write).not.toHaveBeenCalled();
  component['next']();
  expect(component['step']).toBe(3);
  editor.cancelArea();
  expect(component['areasEditing']()).toBe(false);
  editor['editArea'](0);
  editor['areaEditor']()!.area = { placeId: 'xk-prizren', radiusKm: 35 };
  editor['saveArea']();
  await fixture.whenStable();
  expect(component['form'].getRawValue().areas).toEqual([{ placeId: 'xk-prizren', radiusKm: 35 }]);
  expect(draft.write).toHaveBeenLastCalledWith(
    expect.objectContaining({ areas: [{ placeId: 'xk-prizren', radiusKm: 35 }] }),
  );
  component['next']();
  component['previous']();
  await fixture.whenStable();
  editor = fixture.debugElement.query(By.directive(SearchAreasComponent))
    .componentInstance as SearchAreasComponent;
  expect(editor['areas']).toEqual([{ placeId: 'xk-prizren', radiusKm: 35 }]);
  editor['removeArea'](0);
  await fixture.whenStable();
  expect(page.textContent).toContain('Ganz Kosovo');
  component['next']();
  expect(component['step']).toBe(4);
  expect(component['formError']).toBe('');
  component['previous']();
  await fixture.whenStable();
  editor = fixture.debugElement.query(By.directive(SearchAreasComponent))
    .componentInstance as SearchAreasComponent;
  editor['addArea']();
  editor['areaEditor']()!.area.placeId = 'xk-peja';
  component['previous']();
  expect(component['step']).toBe(2);
  expect(component['areasEditing']()).toBe(false);
  expect(component['form'].getRawValue().areas).toEqual([]);
});

it.each([
  ['', 'Ganz Kosovo'],
  ['sq', 'Gjithë Kosova'],
  ['en', 'All of Kosovo'],
])(
  'allows a legacy empty location draft and hands all of Kosovo to search in %s',
  async (locale, label) => {
    const { component, fixture, page } = await setup(
      { ...travel, areas: [{ placeId: '', radiusKm: 20 }] },
      locale,
    );
    expect(component['areas'].value).toEqual([]);
    for (let i = 0; i < 4; i++) component['next']();
    await fixture.whenStable();
    expect(component['step']).toBe(5);
    expect(page.textContent).toContain(label);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component['search']();
    const url = new URL(navigate.mock.calls[0][0] as string, 'http://localhost');
    expect(url.pathname).toBe(`${locale ? '/' + locale : ''}/garages`);
    expect([...url.searchParams.keys()]).toEqual(['all', 'service']);
    expect(url.searchParams.get('all')).toBe('true');
    expect(url.searchParams.get('service')).toBe('bremsen');
  },
);

it('explains date errors separately from optional location errors', async () => {
  const { component } = await setup({ ...travel, areas: [], latestPickupOn: '2026-10-01' });
  component['next']();
  component['next']();
  component['next']();
  expect(component['step']).toBe(3);
  expect(component['formError']).toContain('Abholung darf nicht vor der Abgabe');
  expect(component['formError']).not.toContain('Orte');
  component['form'].controls.latestPickupOn.setValue(travel.latestPickupOn);
  component['areas'].setValue([{ placeId: 'xk-pristina', radiusKm: 4 }]);
  component['next']();
  expect(component['formError']).toContain('zwischen 5 und 100 km');
  expect(component['formError']).not.toContain('Abholung');
  component['areas'].setValue([]);
  component['next']();
  expect(component['step']).toBe(4);
});

it.each(['', 'sq', 'en'])(
  'preserves the started request as the header login target for /%s',
  async (locale) => {
    const { fixture } = await setup(undefined, locale);
    const header = fixture.debugElement.query(By.directive(SiteHeaderComponent))
      .componentInstance as SiteHeaderComponent;
    expect(header.loginReturnTo()).toBe(`/${locale ? locale + '/' : ''}inquiry`);
  },
);
