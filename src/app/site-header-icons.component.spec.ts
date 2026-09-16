import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { AccountSessionService } from './account-session.service';
import { SiteHeaderComponent } from './site-header.component';
import { LucideIconComponent } from './ui/lucide-icon.component';

const accountPanel = () => document.querySelector<HTMLElement>('[data-account-panel]');

describe.each(['', 'sq', 'en'])('Account menu icons for /%s', (locale) => {
  it.each(['customer', 'moderator', 'admin', 'garage'])(
    'renders consistent decorative icons without changing %s navigation',
    async (role) => {
      const account = {
        signedIn: signal(true),
        state: signal('ready'),
        identity: signal({
          userId: 'fictional-menu-user',
          accountType: role === 'garage' ? 'garage' : 'customer',
          roles: [role === 'garage' ? 'customer' : role],
          garageMemberships: [],
        }),
        displayName: () => 'Fiktives Konto',
        busy: signal(false),
        refresh: vi.fn().mockResolvedValue(undefined),
      };
      await TestBed.configureTestingModule({
        imports: [SiteHeaderComponent],
        providers: [
          provideRouter([{ path: locale, component: SiteHeaderComponent }]),
          { provide: AccountSessionService, useValue: account },
        ],
      }).compileComponents();
      await TestBed.inject(Router).navigateByUrl('/' + locale);
      const fixture = TestBed.createComponent(SiteHeaderComponent);
      fixture.componentRef.setInput(
        'active',
        role === 'admin' ? 'admin' : role === 'moderator' ? 'moderation' : undefined,
      );
      await fixture.whenStable();
      const page = fixture.nativeElement as HTMLElement;
      const internal = role === 'admin' || role === 'moderator';
      expect(page.querySelector('#desktop-navigation') === null).toBe(internal);
      const navigationTrigger = page.querySelector<HTMLButtonElement>(
        'button.mobile-menu-toggle[brnOverlayTrigger]',
      );
      expect(navigationTrigger === null).toBe(internal);
      if (!internal) {
        expect(navigationTrigger!.getAttribute('aria-expanded')).toBe('false');
        expect(navigationTrigger!.getAttribute('aria-controls')).toMatch(/^brn-overlay-\d+$/);
        expect(
          document.getElementById(navigationTrigger!.getAttribute('aria-controls')!),
        ).toBeNull();
      }
      expect(page.querySelector('app-language-switcher lucide-icon')).not.toBeNull();
      page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!.click();
      await fixture.whenStable();
      const menu = accountPanel()!;
      const prefix = locale ? '/' + locale : '';
      const expectLinkIcon = (selector: string, name: string, path: string) => {
        const link = menu.querySelector<HTMLAnchorElement>(selector)!;
        expect(link.getAttribute('href')).toBe(prefix + path);
        expect(link.textContent?.trim()).toBeTruthy();
        const icon = fixture.debugElement.query(By.css(selector + ' lucide-icon'));
        expect(icon, selector).not.toBeNull();
        expect((icon.componentInstance as LucideIconComponent).name().icon.name).toBe(name);
        const host = icon.nativeElement as HTMLElement;
        expect(host.classList.contains('size-4.5')).toBe(true);
        expect(host.classList.contains('shrink-0')).toBe(true);
        expect(host.getAttribute('aria-hidden')).toBe('true');
        expect(host.querySelector('svg')?.getAttribute('focusable')).toBe('false');
        expect(host.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(host.querySelector('path')?.getAttribute('d')).toBeTruthy();
      };
      expectLinkIcon('[data-account-profile]', 'user', '/profile');
      if (role === 'admin') {
        expectLinkIcon('[data-account-staff="admin"]', 'settings', '/admin');
      } else {
        expect(menu.querySelector('[data-account-staff="admin"]')).toBeNull();
      }
      if (role === 'admin' || role === 'moderator') {
        expectLinkIcon('[data-account-staff="moderation"]', 'shield-check', '/moderation');
      } else {
        expect(menu.querySelector('[data-account-staff="moderation"]')).toBeNull();
      }
      if (role === 'garage') {
        expectLinkIcon('[data-account-garages]', 'wrench', '/garages/new');
        expect(menu.querySelector('[data-account-inquiries]')).toBeNull();
      } else {
        expectLinkIcon('[data-account-inquiries]', 'message-circle', '/inquiries');
        expect(menu.querySelector('[data-account-garages]')).toBeNull();
      }
      expectLinkIcon('[data-account-reviews]', 'star', '/reviews');
      expectLinkIcon('[data-account-favorites]', 'heart', '/favorites');
    },
  );
});
