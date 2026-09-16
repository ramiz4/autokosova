import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { OwnAccount } from '../shared/account';
import type { RepairRequestPage, SavedRepairRequest } from '../shared/saved-repair-request';
import { routes } from './app.routes';
import { AccountSessionService } from './account-session.service';
import { InquiriesComponent } from './inquiries.component';
import { SavedRepairRequestsService } from './saved-repair-requests.service';

const account: OwnAccount = {
  userId: 'menu-dialog-fixture',
  displayName: 'Fiktives Konto',
  roles: ['customer'],
  garageMemberships: [],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};
const request: SavedRepairRequest = {
  id: 'menu-dialog-fixture',
  active: true,
  revision: 1,
  serviceCategoryId: 'bremsen',
  symptom: 'Fiktiver Bedarf',
  createdAt: '2026-09-16T12:00:00Z',
  updatedAt: '2026-09-16T12:00:00Z',
  areas: [],
  vehicle: { makeId: 'skoda', model: 'Fixture' },
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  attachmentIds: [],
};
const requests: RepairRequestPage = {
  requests: [
    {
      id: request.id,
      active: request.active,
      revision: request.revision,
      serviceCategoryId: request.serviceCategoryId,
      symptomPreview: request.symptom,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      areas: request.areas,
      vehicle: request.vehicle,
    },
  ],
  nextCursor: null,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      const path = new URL(String(url), 'http://localhost').pathname;
      if (path === '/api/me') return json(account);
      if (path === '/api/me/repair-requests') return json(requests);
      if (path === `/api/me/repair-requests/${request.id}`) return json(request);
      return json({}, 404);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

async function render() {
  await TestBed.configureTestingModule({
    imports: [InquiriesComponent],
    providers: [provideRouter(routes)],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl('/inquiries');
  const fixture = TestBed.createComponent(InquiriesComponent);
  const saved = fixture.debugElement.injector.get(SavedRepairRequestsService);
  await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).toBe('ready'));
  await vi.waitFor(() => expect(saved.state()).toBe('ready'));
  await fixture.whenStable();
  return { fixture, saved, page: fixture.nativeElement as HTMLElement };
}

it('closes the CDK menu before either dialog owns focus and restores the persistent trigger', async () => {
  const { fixture, saved, page } = await render();
  const trigger = page.querySelector<HTMLButtonElement>('[data-inquiry-menu]')!;

  trigger.click();
  await fixture.whenStable();
  expect(document.querySelector('[role="menu"]')).toBeTruthy();
  document.querySelector<HTMLButtonElement>('[data-edit-inquiry]')!.click();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await vi.waitFor(() => expect(saved.detailState()).toBe('ready'));
  await fixture.whenStable();
  expect(document.querySelector('[data-inquiry-editor]')).toBeTruthy();
  expect(document.activeElement).toBe(document.querySelector('#edit-service'));

  document
    .querySelector<HTMLElement>('[data-inquiry-editor]')!
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  await fixture.whenStable();
  expect(document.querySelector('[data-inquiry-editor]')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  trigger.click();
  await fixture.whenStable();
  document.querySelector<HTMLButtonElement>('[data-delete-inquiry]')!.click();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await fixture.whenStable();
  expect(document.querySelector('[data-delete-dialog]')).toBeTruthy();
  expect(document.activeElement).toBe(document.querySelector('[data-cancel-delete]'));
  document.querySelector<HTMLButtonElement>('[data-cancel-delete]')!.click();
  await fixture.whenStable();
  expect(document.activeElement).toBe(trigger);
});
