import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AccountProfileComponent } from './account-profile.component';
import { AccountSessionService } from './account-session.service';
import { SiteHeaderComponent } from './site-header.component';
import { routes } from './app.routes';
import { routePath } from './language.service';
import { accountType, type OwnAccount } from '../shared/account';

const member = { garageId: 'fixture-garage', role: 'editor' as const };
const cases: {
  name: string;
  account: Pick<OwnAccount, 'accountType' | 'roles' | 'garageMemberships'>;
}[] = [
  {
    name: 'customer',
    account: { accountType: 'customer', roles: ['customer'], garageMemberships: [] },
  },
  {
    name: 'operator without garages',
    account: { accountType: 'garage', roles: ['customer'], garageMemberships: [] },
  },
  {
    name: 'operator with membership',
    account: { accountType: 'garage', roles: ['customer'], garageMemberships: [member] },
  },
  {
    name: 'customer with privileged roles',
    account: {
      accountType: 'customer',
      roles: ['customer', 'moderator', 'admin'],
      garageMemberships: [],
    },
  },
  {
    name: 'operator with privileged roles',
    account: {
      accountType: 'garage',
      roles: ['customer', 'moderator', 'admin'],
      garageMemberships: [member],
    },
  },
  {
    name: 'legacy membership context',
    account: { roles: ['customer'], garageMemberships: [member] },
  },
];

afterEach(() => vi.unstubAllGlobals());

for (const scenario of cases) {
  it.each(['de', 'sq', 'en'] as const)(
    `exposes one personal favorites link in both account navigations for ${scenario.name} in %s`,
    async (locale) => {
      const identity: OwnAccount = {
        userId: 'fixture-person',
        displayName: 'Fiktives Konto',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        ...scenario.account,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => new Response(JSON.stringify(identity))),
      );
      await TestBed.configureTestingModule({
        imports: [AccountProfileComponent, SiteHeaderComponent],
        providers: [provideRouter(routes)],
      }).compileComponents();
      const router = TestBed.inject(Router);
      await router.navigateByUrl(routePath(locale, 'profile'));
      const profile = TestBed.createComponent(AccountProfileComponent);
      const header = TestBed.createComponent(SiteHeaderComponent);
      header.componentRef.setInput('active', 'favorites');
      header.componentRef.setInput('compact', true);
      await profile.whenStable();
      await header.whenStable();
      const account = TestBed.inject(AccountSessionService);
      await vi.waitFor(() => expect(account.state()).toBe('ready'));
      await profile.whenStable();
      const page = profile.nativeElement as HTMLElement;
      const profileLinks = page.querySelectorAll<HTMLAnchorElement>(
        'main [data-account-favorites]',
      );
      expect(profileLinks).toHaveLength(1);
      const target = routePath(locale, 'favorites');
      expect(profileLinks[0].getAttribute('href')).toBe(target);
      expect(profileLinks[0].classList.contains('focus-visible:outline-2')).toBe(true);
      const business = accountType(identity) === 'garage';
      expect(!!page.querySelector('main [data-account-garages]')).toBe(business);
      expect(!!page.querySelector(`main a[href="${routePath(locale, 'inquiries')}"]`)).toBe(
        !business,
      );
      const top = header.nativeElement as HTMLElement;
      expect(top.querySelector('[data-account-favorites]')).toBeNull();
      top.querySelector<HTMLButtonElement>('[aria-controls="account-menu"]')!.click();
      await vi.waitFor(() => expect(account.state()).toBe('ready'));
      await header.whenStable();
      const links = top.querySelectorAll<HTMLAnchorElement>(
        '#account-menu [data-account-favorites]',
      );
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute('href')).toBe(target);
      expect(links[0].getAttribute('aria-current')).toBe('page');
      expect(links[0].classList.contains('bg-blue-50')).toBe(true);
      expect(!!top.querySelector('[data-account-garages]')).toBe(business);
      expect(!!top.querySelector('[data-account-inquiries]')).toBe(!business);
      expect(top.querySelector('#desktop-navigation [data-account-favorites]')).toBeNull();
      expect(top.querySelector('#mobile-navigation [data-account-favorites]')).toBeNull();
      links[0].click();
      await header.whenStable();
      expect(router.url).toBe(target);
      expect(top.querySelector('#account-menu')).toBeNull();
      account.invalidate();
      await profile.whenStable();
      await header.whenStable();
      expect(page.querySelector('main [data-account-favorites]')).toBeNull();
      expect(top.querySelector('[data-account-favorites]')).toBeNull();
    },
  );
}

it.each(['guest', 'loading', 'error'] as const)(
  'does not expose private favorites navigation during %s',
  async (state) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        if (state === 'loading') return new Promise<Response>(() => {});
        if (state === 'error') return Promise.reject(new Error('offline'));
        return Promise.resolve(new Response('{}', { status: 401 }));
      }),
    );
    await TestBed.configureTestingModule({
      imports: [AccountProfileComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
    const fixture = TestBed.createComponent(AccountProfileComponent);
    await fixture.whenStable();
    await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).toBe(state));
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('[aria-controls="account-menu"]')?.click();
    await fixture.whenStable();
    expect(page.querySelector('[data-account-favorites]')).toBeNull();
    expect(page.querySelector('a[href="/favorites"]')).toBeNull();
  },
);
