import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';

const accountPanel = () => document.querySelector<HTMLElement>('[data-account-panel]');
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
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

function editorDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-inquiry-editor]');
}

function deleteDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-delete-dialog]');
}

function actionMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="menu"]');
}

function actionItem(selector: string): HTMLElement | null {
  return actionMenu()?.querySelector<HTMLElement>(selector) ?? null;
}

function dispatchMenuKey(target: EventTarget, key: string, shiftKey = false): void {
  const keyCodes: Readonly<Record<string, number>> = {
    ArrowDown: 40,
    ArrowUp: 38,
    d: 68,
    Enter: 13,
    End: 35,
    Escape: 27,
    Home: 36,
    Space: 32,
    Tab: 9,
  };
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, shiftKey });
  Object.defineProperty(event, 'keyCode', { value: keyCodes[key] ?? 0 });
  target.dispatchEvent(event);
}

it.each(['de', 'sq', 'en'] as const)(
  'uses the canonical %s overview, readonly details and only approved search filters',
  async (locale) => {
    const path = routePath(locale, 'inquiries');
    const { page, fixture } = await render(path);
    expect(page.querySelector('h1')?.textContent).toContain(inquiriesCopy[locale].title);
    expect(page.querySelector('[data-new-inquiry]')?.getAttribute('href')).toBe(
      routePath(locale, 'request'),
    );
    expect(page.querySelectorAll('[data-inquiry-card]')).toHaveLength(1);
    expect(page.querySelector('[data-inquiry-card]')?.textContent).toContain(detail.symptom);
    page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
    await fixture.whenStable();
    const href = actionMenu()!.querySelector('[data-inquiry-search]')!.getAttribute('href')!;
    const search = new URL(href, 'http://localhost');
    expect(search.pathname).toBe(routePath(locale, 'search'));
    expect([...search.searchParams.keys()].sort()).toEqual(['places', 'service']);
    expect(search.searchParams.get('places')).toBe('xk-pristina:20');
    expect(search.searchParams.get('service')).toBe('bremsen');
    expect(href).not.toContain('PRIVATE');
    expect(href).not.toContain(detail.id);
    expect(actionMenu()!.querySelector('[data-inquiry-view]')?.getAttribute('href')).toBe(
      routePath(locale, 'inquiry-detail', detail.id),
    );
    expect(page.querySelector('[data-inquiry-detail]')).toBeNull();
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
  const toggle = page.querySelector<HTMLButtonElement>('[data-account-trigger]')!;
  toggle.focus();
  toggle.click();
  await vi.waitFor(() => expect(account.state()).toBe('ready'));
  await fixture.whenStable();
  const overlayTrigger = page.querySelector<HTMLButtonElement>('[data-account-trigger]')!;
  const panel = accountPanel()!;
  expect(overlayTrigger.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(overlayTrigger.getAttribute('aria-controls')!)).not.toBeNull();
  const link = panel.querySelector<HTMLAnchorElement>('[data-account-inquiries]')!;
  expect(link.getAttribute('href')).toBe('/inquiries');
  expect(link.getAttribute('aria-current')).toBe('page');
  expect(link.classList.contains('bg-blue-50')).toBe(true);
  expect(panel.querySelector('[data-account-profile]')?.getAttribute('href')).toBe('/profile');
  expect(panel.querySelector('[data-account-menu-roles]')?.children).toHaveLength(1);
  expect(panel.querySelector('[data-account-menu-roles]')?.textContent).toContain('Privatkunde');
  expect(page.querySelector('nav [data-account-inquiries]')).toBeNull();
  link.click();
  await fixture.whenStable();
  expect(accountPanel()).toBeNull();
  overlayTrigger.click();
  await vi.waitFor(() => expect(account.state()).toBe('ready'));
  await fixture.whenStable();
  overlayTrigger.focus();
  overlayTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await fixture.whenStable();
  expect(accountPanel()).toBeNull();
  expect(document.activeElement).toBe(overlayTrigger);
  current = null;
  account.invalidate();
  await fixture.whenStable();
  overlayTrigger.click();
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
  current = null;
  TestBed.inject(AccountSessionService).invalidate();
  await fixture.whenStable();
  expect(page.querySelectorAll('[data-inquiry-card]')).toHaveLength(0);
  expect(document.querySelector('[data-auth-login]')?.getAttribute('href')).toBe(
    '/auth/login?returnTo=%2Fsq%2Finquiries',
  );
  expect(page.textContent).not.toContain('PRIVATE-SYMPTOM');
  expect(document.querySelector('[data-auth-required-dialog]')?.textContent).toContain(
    'Identifikohu',
  );
  TestBed.inject(AccountSessionService).loginAvailable.set(false);
  await fixture.whenStable();
  expect(document.querySelector('[data-auth-login]')).toBeNull();
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

it('edits the stored detail, keeps private attachments and the separate creation draft, and only confirms an API success', async () => {
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const dialog = editorDialog()!;
  expect(dialog.closest('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
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
  expect(editorDialog()).toBeTruthy();
  expect(TestBed.inject(RepairRequestDraft).read()?.['symptom']).toBe('UNSAVED-DRAFT');
  mutate.mockResolvedValue(true);
  dialog.querySelector<HTMLButtonElement>('[data-save-inquiry]')!.click();
  await fixture.whenStable();
  expect(editorDialog()).toBeNull();
});

it('validates local dates and guards unsaved edits on Escape and navigation', async () => {
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const dialog = editorDialog()!;
  const pickup = dialog.querySelector<HTMLInputElement>('#edit-pickup')!;
  pickup.value = '2026-01-01';
  pickup.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  const mutation = vi.spyOn(service, 'mutate');
  dialog.querySelector<HTMLButtonElement>('[data-save-inquiry]')!.click();
  await fixture.whenStable();
  expect(mutation).not.toHaveBeenCalled();
  expect(dialog.querySelector('[data-edit-validation]')).toBeTruthy();
  dialog.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await fixture.whenStable();
  expect(dialog.textContent).toContain(inquiriesCopy.de.discardTitle);
  const leaving = fixture.componentInstance.canLeave();
  expect(leaving).toBeInstanceOf(Promise);
  await fixture.whenStable();
  dialog.querySelector<HTMLButtonElement>('[data-discard-edit]')!.click();
  await fixture.whenStable();
  expect(await leaving).toBe(true);
  expect(editorDialog()).toBeNull();
});

it('requires confirmation before deletion, supports cancellation and discards the dialog on account change', async () => {
  const { page, fixture, service } = await render();
  const mutate = vi.spyOn(service, 'mutate').mockResolvedValue(true);
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  expect(mutate).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('[data-cancel-delete]')!.click();
  await fixture.whenStable();
  expect(deleteDialog()).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  document.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.click();
  await fixture.whenStable();
  expect(mutate).toHaveBeenCalledWith(pageData.requests[0], { kind: 'delete' });
  expect(deleteDialog()).toBeNull();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  TestBed.inject(AccountSessionService).invalidate();
  await fixture.whenStable();
  expect(deleteDialog()).toBeNull();
});

it('falls back to the inquiries title after a confirmed delete removes its actions trigger', async () => {
  const { page, fixture, service } = await render();
  detailResponse = () => new Response(null, { status: 204 });
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  document.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.click();
  await vi.waitFor(() => expect(service.requests()).toHaveLength(0));
  await vi.waitFor(() => expect(deleteDialog()).toBeNull());
  expect(document.activeElement).toBe(page.querySelector('#inquiries-title'));
});

it('does not save an unchanged or reverted inquiry and cancels without a discard prompt', async () => {
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const dialog = editorDialog()!;
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
  dialog.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await fixture.whenStable();
  expect(editorDialog()).toBeNull();
  expect(mutation).not.toHaveBeenCalled();
});

it('keeps the editor open while a save is pending and closes only after its confirmed result', async () => {
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const symptom = editorDialog()!.querySelector<HTMLTextAreaElement>('#edit-symptom')!;
  symptom.value = 'Langsame fiktive Änderung';
  symptom.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  let resolveMutation!: (result: boolean) => void;
  const pendingMutation = new Promise<boolean>((resolve) => (resolveMutation = resolve));
  vi.spyOn(service, 'mutate').mockImplementation(async () => {
    service.writeState.set('saving');
    return pendingMutation;
  });
  editorDialog()!.querySelector<HTMLButtonElement>('[data-save-inquiry]')!.click();
  await vi.waitFor(() => expect(service.writeState()).toBe('saving'));
  editorDialog()!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await fixture.whenStable();
  expect(editorDialog()).toBeTruthy();
  expect(editorDialog()!.textContent).not.toContain(inquiriesCopy.de.discardTitle);
  resolveMutation(true);
  await vi.waitFor(() => expect(editorDialog()).toBeNull());
});

it('resolves a pending navigation guard safely when the editor is destroyed by a session change', async () => {
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const symptom = editorDialog()!.querySelector<HTMLTextAreaElement>('#edit-symptom')!;
  symptom.value = 'Ungespeicherte fiktive Navigation';
  symptom.dispatchEvent(new Event('input', { bubbles: true }));
  const leaving = fixture.componentInstance.canLeave();
  expect(leaving).toBeInstanceOf(Promise);
  current = null;
  TestBed.inject(AccountSessionService).invalidate();
  await fixture.whenStable();
  expect(await leaving).toBe(false);
  expect(editorDialog()).toBeNull();
});

it('falls back to the stable inquiries title when the persistent editor trigger is gone', async () => {
  const { page, fixture, service } = await render();
  const trigger = page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!;
  trigger.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  trigger.remove();
  editorDialog()!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await vi.waitFor(() => expect(editorDialog()).toBeNull());
  expect(document.activeElement).toBe(page.querySelector('#inquiries-title'));
});

it('preserves the editor and unsaved text across real session revalidation', async () => {
  const { page, fixture, service } = await render();
  page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  const editor = page.querySelector('app-inquiry-editor')!;
  const input = editorDialog()!.querySelector<HTMLTextAreaElement>(
    'textarea[formControlName="symptom"]',
  )!;
  input.value = 'Ungespeicherte fiktive Bearbeitung';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  current = { ...identity, displayName: 'Aktualisiertes fiktives Konto' };
  await TestBed.inject(AccountSessionService).refresh();
  await fixture.whenStable();
  expect(page.querySelector('app-inquiry-editor')).toBe(editor);
  expect(input.value).toBe('Ungespeicherte fiktive Bearbeitung');
});

it('shows activation changes as dismissible toasts instead of an inline notice', async () => {
  const { page, fixture, service } = await render();
  for (const notice of ['deactivated', 'reactivated'] as const) {
    service.notice.set(notice);
    await fixture.whenStable();
    expect(page.querySelector('[data-inquiry-toast]')?.textContent).toContain(
      inquiriesCopy.de[notice],
    );
    expect(page.querySelector('[data-inquiry-notice]')).toBeNull();
    page.querySelector<HTMLButtonElement>('[data-inquiry-toast] button')!.click();
    await fixture.whenStable();
    expect(page.querySelector('[data-inquiry-toast]')).toBeNull();
  }
});

it.each(['de', 'sq', 'en'] as const)(
  'keeps cards and details stable through both status directions in %s',
  async (locale) => {
    const { page, fixture, service } = await render(routePath(locale, 'inquiries'));
    const originalCard = page.querySelector('[data-inquiry-card]');
    await service.toggleDetail(detail.id);
    await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
    await fixture.whenStable();
    const calls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes('?limit')).length;
    for (const [active, revision] of [
      [false, 2],
      [true, 3],
    ] as const) {
      detailResponse = () => json({ ...detail, active, revision });
      page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
      await fixture.whenStable();
      actionItem('[data-toggle-inquiry]')!.click();
      await vi.waitFor(() => expect(service.requests()[0].revision).toBe(revision));
      await fixture.whenStable();
      expect(page.querySelector('[data-inquiry-card]')).toBe(originalCard);
      expect(page.querySelector('.status-badge')?.textContent?.trim()).toBe(
        inquiriesCopy[locale][active ? 'active' : 'inactive'],
      );
      expect(service.detail()?.symptom).toBe(detail.symptom);
    }
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('?limit')).length,
    ).toBe(calls);
  },
);

it.each(['de', 'sq', 'en'] as const)(
  'identifies the selected inquiry, explains deactivation and labels the destructive confirmation in %s',
  async (locale) => {
    const { page, fixture, service } = await render(routePath(locale, 'inquiries'));
    const mutate = vi.spyOn(service, 'mutate').mockResolvedValue(false);
    page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!.click();
    await fixture.whenStable();
    actionItem('[data-delete-inquiry]')!.click();
    await fixture.whenStable();
    const dialog = deleteDialog()!;
    expect(dialog.querySelector('[data-delete-summary]')?.textContent).toContain('Fixture');
    expect(dialog.querySelector('[data-delete-summary]')?.textContent).toContain(detail.symptom);
    expect(dialog.querySelector('[data-delete-summary] b')).toBeNull();
    expect(dialog.textContent).toContain(inquiriesCopy[locale].deactivateInstead);
    expect(dialog.querySelector('[data-confirm-delete]')?.textContent?.trim()).toBe(
      inquiriesCopy[locale].deleteConfirm,
    );
    expect(mutate).not.toHaveBeenCalled();
    service.writeState.set('saving');
    await fixture.whenStable();
    expect(dialog.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.disabled).toBe(true);
    expect(dialog.querySelector<HTMLButtonElement>('[data-cancel-delete]')!.disabled).toBe(true);
    expect(dialog.querySelector('[data-confirm-delete]')?.textContent).toContain(
      inquiriesCopy[locale].deleting,
    );
  },
);

it.each(['de', 'sq', 'en'] as const)(
  'groups every card action in a named menu in %s',
  async (locale) => {
    listResponse = () =>
      json({
        ...pageData,
        requests: [
          pageData.requests[0],
          {
            ...pageData.requests[0],
            id: 'inactive-fixture',
            active: false,
          },
        ],
      });
    const { page, fixture } = await render(routePath(locale, 'inquiries'));
    const copy = inquiriesCopy[locale];
    const cards = page.querySelectorAll<HTMLElement>('[data-inquiry-card]');
    for (const [index, card] of Array.from(cards).entries()) {
      expect(card.className).toContain('md:grid-cols-[80px_minmax(0,1fr)_300px]');
      expect(card.querySelector('.status-badge span')).toBeNull();
      expect(card.querySelector('[data-inquiry-actions]')?.className).toContain('md:border-l');
      expect(card.querySelector('.saved-date svg')?.classList).toContain('lucide-calendar-days');
      expect(card.querySelector('.status-badge')?.className).toContain('self-start');
      expect(card.querySelector('.card-footer')).toBeNull();
      const trigger = card.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!;
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger.getAttribute('aria-label')).toContain(copy.actions);
      expect(trigger.className).toContain('rounded-full');
      expect(trigger.querySelector('svg')?.getAttribute('stroke-width')).toBe('2');
      expect(trigger.querySelector('svg')?.classList).toContain('lucide-ellipsis-vertical');
      trigger.click();
      await fixture.whenStable();
      const menu = actionMenu()!;
      expect(menu.className).toContain('ring-0');
      expect(menu.getAttribute('aria-labelledby')).toBe(trigger.id);
      expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
      expect(Array.from(items, (item) => item.textContent?.trim())).toEqual([
        copy.view,
        copy.find,
        copy.edit,
        index === 0 ? copy.deactivate : copy.reactivate,
        copy.deleteConfirm,
      ]);
      expect(menu.querySelector('[data-slot="dropdown-menu-separator"]')?.nextElementSibling).toBe(
        items[4],
      );
      if (index === 1)
        expect(
          menu.querySelector<HTMLButtonElement>('[data-inquiry-search-disabled]')?.disabled,
        ).toBe(true);
      expect(document.activeElement).toBe(items[0]);
      trigger.click();
      await fixture.whenStable();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    }
  },
);

it('navigates the action menu with arrows, Home and End and restores focus on Escape', async () => {
  const { page, fixture } = await render();
  const trigger = page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!;
  trigger.click();
  await fixture.whenStable();
  const items = actionMenu()!.querySelectorAll<HTMLElement>('[role="menuitem"]');
  for (const [key, index] of [
    ['ArrowDown', 1],
    ['End', 4],
    ['ArrowDown', 0],
    ['ArrowUp', 4],
    ['Home', 0],
  ] as const) {
    dispatchMenuKey(document.activeElement!, key);
    await fixture.whenStable();
    expect(document.activeElement).toBe(items[index]);
  }
  dispatchMenuKey(document.activeElement!, 'Escape');
  await fixture.whenStable();
  expect(actionMenu()).toBeNull();
  expect(document.activeElement).toBe(trigger);
  dispatchMenuKey(trigger, 'Enter');
  await fixture.whenStable();
  expect(document.activeElement).toBe(actionItem('[data-inquiry-view]'));
  dispatchMenuKey(document.activeElement!, 'Tab');
  await fixture.whenStable();
  expect(actionMenu()).toBeNull();
  trigger.focus();
  dispatchMenuKey(trigger, 'Space');
  await fixture.whenStable();
  expect(document.activeElement).toBe(actionItem('[data-inquiry-view]'));
  dispatchMenuKey(document.activeElement!, 'd');
  await vi.waitFor(() => expect(document.activeElement).toBe(actionItem('[data-toggle-inquiry]')));
  dispatchMenuKey(document.activeElement!, 'Escape');
  await fixture.whenStable();
  trigger.focus();
  dispatchMenuKey(trigger, 'Space');
  await fixture.whenStable();
  dispatchMenuKey(document.activeElement!, 'Tab', true);
  await fixture.whenStable();
  expect(actionMenu()).toBeNull();
  for (const [key, selector] of [
    ['ArrowUp', '[data-delete-inquiry]'],
    ['ArrowDown', '[data-inquiry-view]'],
  ] as const) {
    dispatchMenuKey(trigger, key);
    await fixture.whenStable();
    expect(document.activeElement).toBe(actionItem(selector));
  }
});

it('opens only one card menu at a time without writing', async () => {
  listResponse = () =>
    json({
      ...pageData,
      requests: [pageData.requests[0], { ...pageData.requests[0], id: 'second-fixture' }],
    });
  const { page, fixture, service } = await render();
  const mutate = vi.spyOn(service, 'mutate');
  const triggers = page.querySelectorAll<HTMLButtonElement>('[data-inquiry-menu]');
  for (const trigger of triggers) {
    trigger.click();
    await fixture.whenStable();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(actionMenu()?.getAttribute('aria-labelledby')).toBe(trigger.id);
  }
  expect(mutate).not.toHaveBeenCalled();
});

it('blocks management and details while a write is pending', async () => {
  const { page, fixture, service } = await render();
  const mutate = vi.spyOn(service, 'mutate');
  const trigger = page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!;
  trigger.click();
  await fixture.whenStable();
  service.writeState.set('saving');
  await fixture.whenStable();
  for (const item of actionMenu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
    if (item instanceof HTMLButtonElement) expect(item.disabled).toBe(true);
    else expect(item.getAttribute('aria-disabled')).toBe('true');
    item.click();
  }
  expect(trigger.disabled).toBe(true);
  await fixture.whenStable();
  expect(mutate).not.toHaveBeenCalled();
  expect(page.querySelector('[data-inquiry-editor]')).toBeNull();
  expect(deleteDialog()).toBeNull();
});

it('returns from the editor and delete cancellation to the persistent menu trigger', async () => {
  const { page, fixture, service } = await render();
  const trigger = page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!;
  trigger.click();
  await fixture.whenStable();
  actionItem('[data-edit-inquiry]')!.click();
  await vi.waitFor(() => expect(service.detailState()).toBe('ready'));
  await fixture.whenStable();
  editorDialog()!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await fixture.whenStable();
  expect(editorDialog()).toBeNull();
  expect(document.activeElement).toBe(trigger);
  trigger.click();
  await fixture.whenStable();
  actionItem('[data-delete-inquiry]')!.click();
  await fixture.whenStable();
  document.querySelector<HTMLButtonElement>('[data-cancel-delete]')!.click();
  await fixture.whenStable();
  expect(document.activeElement).toBe(trigger);
});

it('keeps the card and restores menu focus after a failed status change', async () => {
  const { page, fixture, service } = await render();
  const card = page.querySelector('[data-inquiry-card]');
  const trigger = page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!;
  trigger.click();
  await fixture.whenStable();
  detailResponse = () => json({}, 503);
  actionItem('[data-toggle-inquiry]')!.click();
  await vi.waitFor(() => expect(service.writeState()).not.toBe('saving'));
  await fixture.whenStable();
  expect(page.querySelector('[data-inquiry-card]')).toBe(card);
  expect(service.requests()[0].active).toBe(true);
  expect(actionMenu()).toBeNull();
  expect(page.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.activeElement).toBe(trigger);
});
