import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountSessionService } from './account-session.service';
import { GarageManagementComponent } from './garage-management.component';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function setup() {
  const account = {
    dataContext: signal<string | null>('fixture:1'),
    signedIn: signal(true),
    state: signal('ready'),
    identity: signal({ userId: 'fixture', accountType: 'garage', roles: ['customer'] }),
    displayName: () => 'Fixture Garage',
    busy: signal(false),
    loginAvailable: signal(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
  await TestBed.configureTestingModule({
    imports: [GarageManagementComponent],
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: AccountSessionService, useValue: account },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GarageManagementComponent);
  fixture.detectChanges();
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

it('loads the private garage overview with separate create and edit routes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) =>
      url === '/api/me/garages'
        ? new Response(
            JSON.stringify({
              garages: [
                {
                  id: 'owned',
                  name: 'Fiktive Werkstatt',
                  placeId: 'xk-pristina',
                  publicationState: 'published',
                  canDelete: true,
                },
              ],
            }),
          )
        : new Response(JSON.stringify({ photoIds: ['photo-1'] })),
    ),
  );
  const { fixture, page } = await setup();
  await fixture.componentInstance['refresh']();
  fixture.detectChanges();
  await vi.waitFor(() => expect(page.querySelector('[data-edit-garage]')).not.toBeNull());
  expect(page.querySelector('[data-new-garage]')?.getAttribute('href')).toBe('/garages/new');
  expect(page.querySelector('[data-edit-garage]')?.getAttribute('href')).toBe(
    '/garages/manage/owned/edit',
  );
  expect(page.querySelector('[data-edit-garage] svg')?.classList).toContain('lucide-pencil');
  expect(page.querySelector('[data-edit-garage]')?.className).toContain('bg-white');
  expect(page.querySelector('[data-delete-garage]')?.textContent).toContain('Werkstatt löschen');
  expect(page.querySelector<HTMLImageElement>('[data-garage-photo]')?.src).toContain(
    '/api/public/garages/owned/photos/photo-1',
  );
  expect(page.querySelector('form')).toBeNull();
});

it('keeps empty and failure states distinct', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
  const { fixture, page } = await setup();
  await fixture.componentInstance['refresh']();
  fixture.detectChanges();
  expect(page.querySelector('[data-garages-error]')).not.toBeNull();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ garages: [] }))));
  await fixture.componentInstance['refresh']();
  fixture.detectChanges();
  expect(page.querySelector('[data-garages-empty]')).not.toBeNull();
});
