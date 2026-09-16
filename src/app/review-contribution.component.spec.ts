import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReviewContributionComponent } from './review-contribution.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService, routePath } from './language.service';
import type { OwnAccount } from '../shared/account';

const identity: OwnAccount = {
  userId: 'synthetic-owner',
  roles: ['customer'],
  garageMemberships: [{ garageId: 'demo-garage', role: 'editor' }],
  expiresAt: '2099-01-01T00:00:00Z',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(language = 'de', member = true) {
  const account = {
    identity: signal(member ? identity : { ...identity, garageMemberships: [] }),
    signedIn: signal(true),
    dataContext: signal<object | null>({}),
    invalidate: vi.fn(),
  };
  await TestBed.configureTestingModule({
    imports: [ReviewContributionComponent],
    providers: [
      { provide: AccountSessionService, useValue: account },
      { provide: LanguageService, useValue: { language } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ReviewContributionComponent);
  fixture.componentRef.setInput('reviewId', 'synthetic-review');
  fixture.componentRef.setInput('garageId', 'demo-garage');
  fixture.componentRef.setInput('response', {
    text: 'DEMO – Alte öffentlich sichtbare Antwort.',
    createdAt: '2026-09-01T00:00:00Z',
    revision: 4,
  });
  await fixture.whenStable();
  return {
    fixture,
    component: fixture.componentInstance,
    account,
    page: fixture.nativeElement as HTMLElement,
  };
}
it.each(['de', 'sq', 'en'])(
  'requires membership, deliberate confirmation and expected revision in %s',
  async (language) => {
    const { fixture, component } = await render(language);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    component.start();
    component.text = 'DEMO – Neue Antwort auf den unveränderten Kundenbericht.';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.save();
    expect(fetch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.save();
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.responseRevision).toBe(4);
    expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.text).toBe('DEMO – Neue Antwort auf den unveränderten Kundenbericht.');
    expect(component.success()).toBe(true);
    expect(component.editing()).toBe(false);
    await fixture.whenStable();
  },
);
it('does not offer a response merely because a regular account is signed in', async () => {
  const { component, page } = await render('de', false);
  expect(component.canWrite()).toBe(false);
  expect(page.querySelector('[data-start-contribution]')).toBeNull();
});
it('preserves unsaved input on conflict instead of asserting a save', async () => {
  const { component } = await render();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 409 })));
  component.start();
  component.text = 'DEMO – Nicht gespeicherte Antwort für einen Konflikttest.';
  await component.save();
  expect(component.text).toContain('Nicht gespeicherte');
  expect(component.error()).not.toBe('');
  expect(component.success()).toBe(false);
  expect(component.dirty()).toBe(true);
});
it('discards private edit state and ignores a late success after account context changes', async () => {
  const { fixture, component, account } = await render();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const saved = vi.fn();
  component.changed.subscribe(saved);
  component.start();
  component.text = 'DEMO – Antwort des vorherigen privaten Kontokontexts.';
  const pending = component.save();
  account.dataContext.set({});
  await fixture.whenStable();
  finish(new Response(null, { status: 204 }));
  await pending;
  expect(component.text).toBe('');
  expect(component.editing()).toBe(false);
  expect(component.success()).toBe(false);
  expect(saved).not.toHaveBeenCalled();
});
it('keeps review routes canonical across all three UI languages', () => {
  expect(routePath('de', 'reviews')).toBe('/reviews');
  expect(routePath('sq', 'review-new', 'demo-garage')).toBe('/sq/garages/demo-garage/reviews/new');
  expect(routePath('en', 'reviews')).toBe('/en/reviews');
});
