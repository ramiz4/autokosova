import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { InquiriesComponent } from './inquiries.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService, routePath } from './language.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';
import { RepairRequestDraft } from './repair-request-draft';
import { inquiriesCopy } from '../shared/inquiries-copy';
import type { OwnAccount } from '../shared/account';
import type { RepairRequestPage, SavedRepairRequest } from '../shared/saved-repair-request';

const identity: OwnAccount = {
  userId: 'fixture-owner',
  displayName: 'Fiktives Konto',
  roles: ['customer', 'admin'],
  garageMemberships: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};
const detail: SavedRepairRequest = {
  active: true,
  revision: 1,
  updatedAt: '2026-09-14T12:00:00Z',
  id: 'fixture-inquiry',
  serviceCategoryId: 'bremsen',
  symptom: '<b>PRIVATE-SYMPTOM</b>',
  createdAt: '2026-09-14T12:00:00Z',
  areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
  vehicle: {
    makeId: 'skoda',
    model: '<img src=x>',
    year: 2018,
    engineDetails: 'PRIVATE-ENGINE',
    mileageKm: 0,
  },
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  attachmentIds: ['PRIVATE-FILE-ID'],
};
const pageData: RepairRequestPage = {
  requests: [
    {
      active: detail.active,
      revision: detail.revision,
      updatedAt: detail.updatedAt,
      id: detail.id,
      serviceCategoryId: detail.serviceCategoryId,
      symptomPreview: detail.symptom,
      createdAt: detail.createdAt,
      areas: detail.areas,
      vehicle: { makeId: 'skoda', model: 'Fixture' },
    },
  ],
  nextCursor: null,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let current: OwnAccount | null;
let listResponse: () => Response;
let detailResponse: () => Response;
beforeEach(() => {
  current = identity;
  listResponse = () => json(pageData);
  detailResponse = () => json(detail);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      const path = new URL(String(url), 'http://localhost').pathname;
      if (path === '/api/me') return current ? json(current) : json({ loginAvailable: true }, 401);
      if (path === '/auth/logout') {
        current = null;
        return new Response(null, { status: 204 });
      }
      if (path === '/api/me/repair-requests') return listResponse();
      if (path.startsWith('/api/me/repair-requests/')) return detailResponse();
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  sessionStorage.removeItem('autokosova.repair-request-draft.v1');
  vi.unstubAllGlobals();
});

async function render(path = '/inquiries') {
  await TestBed.configureTestingModule({
    imports: [InquiriesComponent],
    providers: [provideRouter(routes)],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(path);
  TestBed.inject(RepairRequestDraft).write({
    symptom: 'UNSAVED-DRAFT',
    serviceCategoryId: 'motor',
  });
  const fixture = TestBed.createComponent(InquiriesComponent);
  const service = fixture.debugElement.injector.get(SavedRepairRequestsService);
  await fixture.whenStable();
  await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).not.toBe('loading'));
  if (TestBed.inject(AccountSessionService).state() === 'ready')
    await vi.waitFor(() => expect(service.state()).not.toBe('loading'));
  await fixture.whenStable();
  return { fixture, service, page: fixture.nativeElement as HTMLElement };
}

it.each(['de', 'sq', 'en'] as const)(
  'uses the canonical %s overview, readonly details and only approved search filters',
  async (locale) => {
    const path = routePath(locale, 'inquiries');
    const { page, service, fixture } = await render(path);
    expect(page.querySelector('h1')?.textContent).toContain(inquiriesCopy[locale].title);
    expect(page.querySelector('[data-new-inquiry]')?.getAttribute('href')).toBe(
      routePath(locale, 'request'),
    );
    expect(page.querySelectorAll('[data-inquiry-card]')).toHaveLength(1);
    const href = page.querySelector('[data-inquiry-search]')!.getAttribute('href')!;
    const search = new URL(href, 'http://localhost');
    expect(search.pathname).toBe(routePath(locale, 'search'));
    expect([...search.searchParams.keys()].sort()).toEqual(['places', 'service']);
    expect(search.searchParams.get('places')).toBe('xk-pristina:20');
    expect(search.searchParams.get('service')).toBe('bremsen');
    expect(href).not.toContain('PRIVATE');
    expect(href).not.toContain(detail.id);
    page.querySelector<HTMLButtonElement>('[data-inquiry-view]')!.click();
    await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
    await fixture.whenStable();
    expect(page.querySelector('[data-inquiry-detail]')?.textContent).toContain(detail.symptom);
    expect(page.querySelector('[data-inquiry-detail] b, [data-inquiry-detail] img')).toBeNull();
    expect(
      page.querySelector('[data-inquiry-detail] input, [data-inquiry-detail] textarea'),
    ).toBeNull();
    expect(page.querySelector('time[datetime="2026-10-02"]')).toBeTruthy();
    expect(page.querySelector('time[datetime="2026-10-06"]')).toBeTruthy();
    expect(page.querySelector('[data-inquiry-detail]')?.textContent).toContain('0 km');
    expect(page.textContent).not.toContain('PRIVATE-FILE-ID');
    expect(TestBed.inject(RepairRequestDraft).read()).toEqual({
      symptom: 'UNSAVED-DRAFT',
      serviceCategoryId: 'motor',
    });
    expect(TestBed.inject(Meta).getTag("name='robots'")?.content).toBe('noindex, nofollow');
    expect(TestBed.inject(LanguageService).switchUrl('en')).toBe('/en/inquiries');
  },
);

it('links only the signed-in account menu, marks the active route, preserves profile/roles and closes with keyboard or selection', async () => {
  const { page, fixture } = await render();
  const account = TestBed.inject(AccountSessionService);
  const toggle = page.querySelector<HTMLButtonElement>('[aria-controls="account-menu"]')!;
  toggle.focus();
  toggle.click();
  await vi.waitFor(() => expect(account.state()).toBe('ready'));
  await fixture.whenStable();
  const link = page.querySelector<HTMLAnchorElement>('[data-account-inquiries]')!;
  expect(link.getAttribute('href')).toBe('/inquiries');
  expect(link.getAttribute('aria-current')).toBe('page');
  expect(link.classList.contains('bg-blue-50')).toBe(true);
  expect(page.querySelector('[data-account-profile]')?.getAttribute('href')).toBe('/profile');
  expect(page.querySelector('[data-account-menu-roles]')?.children).toHaveLength(1);
  expect(page.querySelector('[data-account-menu-roles]')?.textContent).toContain('Privatkunde');
  expect(page.querySelector('nav [data-account-inquiries]')).toBeNull();
  link.click();
  await fixture.whenStable();
  expect(page.querySelector('#account-menu')).toBeNull();
  toggle.click();
  await vi.waitFor(() => expect(account.state()).toBe('ready'));
  await fixture.whenStable();
  toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await fixture.whenStable();
  expect(page.querySelector('#account-menu')).toBeNull();
  expect(document.activeElement).toBe(toggle);
  current = null;
  account.invalidate();
  await fixture.whenStable();
  toggle.click();
  await vi.waitFor(() => expect(account.state()).toBe('guest'));
  await fixture.whenStable();
  expect(page.querySelector('[data-account-inquiries]')).toBeNull();
});

it('distinguishes empty, retry, missing detail and expired session without reading a local draft as saved', async () => {
  listResponse = () => json({}, 503);
  const { page, service, fixture } = await render('/sq/inquiries');
  expect(page.querySelector('main [role="alert"]')?.textContent).toContain(
    inquiriesCopy.sq.loadError,
  );
  listResponse = () => json({ requests: [], nextCursor: null });
  page.querySelector<HTMLButtonElement>('[data-inquiries-retry]')!.click();
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  await fixture.whenStable();
  expect(page.querySelector('[data-inquiries-empty]')?.textContent).toContain(
    inquiriesCopy.sq.emptyTitle,
  );
  expect(page.querySelectorAll('[data-inquiry-card]')).toHaveLength(0);
  listResponse = () => json(pageData);
  service.reload();
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  await fixture.whenStable();
  detailResponse = () => json({}, 404);
  page.querySelector<HTMLButtonElement>('[data-inquiry-view]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('missing'));
  await fixture.whenStable();
  expect(page.querySelector('main [role="alert"]')?.textContent).toContain(
    inquiriesCopy.sq.missing,
  );
  current = null;
  TestBed.inject(AccountSessionService).invalidate();
  await fixture.whenStable();
  expect(page.querySelectorAll('[data-inquiry-card]')).toHaveLength(0);
  expect(page.querySelector('[data-inquiries-login]')?.getAttribute('href')).toBe(
    '/auth/login?returnTo=%2Fsq%2Finquiries',
  );
  expect(page.textContent).not.toContain('PRIVATE-SYMPTOM');
  expect(page.querySelector('[data-inquiries-login-help]')?.textContent).toContain(
    inquiriesCopy.sq.expired,
  );
  TestBed.inject(AccountSessionService).loginAvailable.set(false);
  await fixture.whenStable();
  expect(page.querySelector('[data-inquiries-login]')).toBeNull();
});

it('preserves overview context on language change and clears private data during a real shared-service logout', async () => {
  const { page, service, fixture } = await render('/sq/inquiries?view=history#inquiries-title');
  expect(TestBed.inject(LanguageService).switchUrl('en')).toBe(
    '/en/inquiries?view=history#inquiries-title',
  );
  await TestBed.inject(Router).navigateByUrl('/en/inquiries');
  await fixture.whenStable();
  expect(page.querySelector('h1')?.textContent).toContain(inquiriesCopy.en.title);
  await TestBed.inject(AccountSessionService).logout();
  await fixture.whenStable();
  expect(service.requests()).toEqual([]);
  expect(service.detail()).toBeNull();
  expect(page.textContent).not.toContain('PRIVATE-SYMPTOM');
  expect(TestBed.inject(RepairRequestDraft).read()?.['symptom']).toBe('UNSAVED-DRAFT');
  for (const locale of ['sq', 'en'] as const) {
    expect(Object.keys(inquiriesCopy[locale]).sort()).toEqual(Object.keys(inquiriesCopy.de).sort());
    expect(Object.values(inquiriesCopy[locale]).every((text) => text.trim())).toBe(true);
  }
});

// jsdom has no native top-layer implementation. Actual focus trapping is exercised in Chrome.
function supportTestDialog() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
}

afterEach(() => {
  delete (HTMLDialogElement.prototype as unknown as { showModal?: unknown }).showModal;
});

it('edits the stored detail, keeps private attachments and the separate creation draft, and only confirms an API success', async () => {
  supportTestDialog();
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const dialog = page.querySelector<HTMLDialogElement>('[data-inquiry-editor]')!;
  expect(dialog.open).toBe(true);
  const symptom = dialog.querySelector<HTMLTextAreaElement>('#edit-symptom')!;
  expect(symptom.value).toBe(detail.symptom);
  symptom.value = 'Geänderter fiktiver Bedarf';
  symptom.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  const mutate = vi.spyOn(service, 'mutate').mockResolvedValue(false);
  dialog.querySelector<HTMLButtonElement>('[data-save-inquiry]')!.click();
  await fixture.whenStable();
  expect(mutate).toHaveBeenCalledWith(detail, {
    kind: 'update',
    input: expect.objectContaining({
      symptom: symptom.value,
      attachmentIds: detail.attachmentIds,
      vehicle: detail.vehicle,
    }),
  });
  expect(page.querySelector('[data-inquiry-editor]')).toBeTruthy();
  expect(TestBed.inject(RepairRequestDraft).read()?.['symptom']).toBe('UNSAVED-DRAFT');
  mutate.mockResolvedValue(true);
  dialog.querySelector<HTMLButtonElement>('[data-save-inquiry]')!.click();
  await fixture.whenStable();
  expect(page.querySelector('[data-inquiry-editor]')).toBeNull();
});

it('validates local dates and guards unsaved edits on Escape and navigation', async () => {
  supportTestDialog();
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const dialog = page.querySelector<HTMLDialogElement>('[data-inquiry-editor]')!;
  const pickup = dialog.querySelector<HTMLInputElement>('#edit-pickup')!;
  pickup.value = '2026-01-01';
  pickup.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  const mutation = vi.spyOn(service, 'mutate');
  dialog.querySelector<HTMLButtonElement>('[data-save-inquiry]')!.click();
  await fixture.whenStable();
  expect(mutation).not.toHaveBeenCalled();
  expect(dialog.querySelector('[data-edit-validation]')).toBeTruthy();
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  await fixture.whenStable();
  expect(dialog.textContent).toContain(inquiriesCopy.de.discardTitle);
  const leaving = fixture.componentInstance.canLeave();
  expect(leaving).toBeInstanceOf(Promise);
  await fixture.whenStable();
  dialog.querySelector<HTMLButtonElement>('[data-discard-edit]')!.click();
  await fixture.whenStable();
  expect(await leaving).toBe(true);
  expect(page.querySelector('[data-inquiry-editor]')).toBeNull();
});

it('requires confirmation before deletion, supports cancellation and discards the dialog on account change', async () => {
  supportTestDialog();
  const { page, fixture, service } = await render();
  const mutate = vi.spyOn(service, 'mutate').mockResolvedValue(true);
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  page.querySelector<HTMLButtonElement>('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  expect(mutate).not.toHaveBeenCalled();
  page.querySelector<HTMLButtonElement>('[data-cancel-delete]')!.click();
  await fixture.whenStable();
  expect(page.querySelector('[data-delete-dialog]')).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  page.querySelector<HTMLButtonElement>('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  page.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.click();
  await fixture.whenStable();
  expect(mutate).toHaveBeenCalledWith(pageData.requests[0], { kind: 'delete' });
  expect(page.querySelector('[data-delete-dialog]')).toBeNull();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  page.querySelector<HTMLButtonElement>('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  TestBed.inject(AccountSessionService).invalidate();
  await fixture.whenStable();
  expect(page.querySelector('[data-delete-dialog]')).toBeNull();
});

it('does not save an unchanged or reverted inquiry and cancels without a discard prompt', async () => {
  supportTestDialog();
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const dialog = page.querySelector<HTMLDialogElement>('[data-inquiry-editor]')!;
  const save = dialog.querySelector<HTMLButtonElement>('[data-save-inquiry]')!;
  expect(save.disabled).toBe(true);
  const mutation = vi.spyOn(service, 'mutate');
  save.click();
  expect(mutation).not.toHaveBeenCalled();
  const input = dialog.querySelector<HTMLTextAreaElement>('#edit-symptom')!;
  const original = input.value;
  input.value = 'Geändert';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(save.disabled).toBe(false);
  input.value = original;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(save.disabled).toBe(true);
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  await fixture.whenStable();
  expect(page.querySelector('[data-inquiry-editor]')).toBeNull();
  expect(mutation).not.toHaveBeenCalled();
});
