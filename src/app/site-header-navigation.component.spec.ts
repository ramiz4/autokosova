import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AccountSessionService } from './account-session.service';
import { SiteHeaderComponent } from './site-header.component';

const account = () => ({
  signedIn: signal(false),
  state: signal('guest'),
  identity: signal(null),
  displayName: () => '',
  busy: signal(false),
  refresh: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(true),
});

const navigationState = (component: SiteHeaderComponent) =>
  component as unknown as {
    onAccountState(state: 'open' | 'closed'): void;
  };

describe('Mobile header navigation overlay', () => {
  let breakpoints: BehaviorSubject<BreakpointState>;

  beforeEach(async () => {
    breakpoints = new BehaviorSubject<BreakpointState>({ matches: false, breakpoints: {} });
    await TestBed.configureTestingModule({
      imports: [SiteHeaderComponent],
      providers: [
        provideRouter([{ path: 'next', component: SiteHeaderComponent }]),
        { provide: AccountSessionService, useValue: account() },
        { provide: BreakpointObserver, useValue: { observe: () => breakpoints.asObservable() } },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(SiteHeaderComponent);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  const navigationTrigger = (page: HTMLElement) =>
    page.querySelector<HTMLButtonElement>('button.mobile-menu-toggle[brnOverlayTrigger]')!;
  const navigationPanel = (trigger: HTMLButtonElement) =>
    document
      .getElementById(trigger.getAttribute('aria-controls') ?? '')
      ?.querySelector<HTMLElement>('nav');

  it('uses the nonmodal Brain overlay contract and preserves native mobile links', async () => {
    const { fixture, page } = await render();
    const trigger = navigationTrigger(page);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toMatch(/^brn-overlay-\d+$/);
    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
    expect(navigationPanel(trigger)).toBeUndefined();

    trigger.focus();
    trigger.click();
    await fixture.whenStable();

    const overlay = document.getElementById(trigger.getAttribute('aria-controls')!)!;
    const navigation = navigationPanel(trigger)!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(navigation.querySelector('a.nav-link'));
    expect(overlay.getAttribute('role')).toBeNull();
    expect(overlay.getAttribute('aria-modal')).toBeNull();
    expect(navigation.getAttribute('role')).toBeNull();
    expect(navigation.getAttribute('aria-label')).toBe('Mobile Navigation');
    expect(navigation.style.width).not.toBe('');
    expect(navigation.className).toContain('sm:p-5');
    expect(navigation.querySelectorAll('[role="menu"], [role="dialog"]')).toHaveLength(0);
    expect(
      Array.from(navigation.querySelectorAll<HTMLAnchorElement>('a.nav-link')).map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['/inquiry', '/garages', '/garages/new']);
    expect(navigation.querySelectorAll('a[href^="/auth/login"]')).toHaveLength(2);

    navigation.querySelector<HTMLAnchorElement>('a.nav-link')!.focus();
    navigation.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(navigationPanel(trigger)).toBeUndefined();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a second activation, route transition and desktop breakpoint without delayed account-close interference', async () => {
    const { fixture, page } = await render();
    const trigger = navigationTrigger(page);
    const open = async () => {
      trigger.click();
      await fixture.whenStable();
      expect(navigationPanel(trigger)).toBeDefined();
    };

    await open();
    navigationState(fixture.componentInstance).onAccountState('closed');
    await fixture.whenStable();
    expect(navigationPanel(trigger)).toBeDefined();

    trigger.click();
    await fixture.whenStable();
    expect(navigationPanel(trigger)).toBeUndefined();

    await open();
    await TestBed.inject(Router).navigateByUrl('/next');
    await fixture.whenStable();
    expect(navigationPanel(trigger)).toBeUndefined();

    await open();
    breakpoints.next({ matches: true, breakpoints: {} });
    await fixture.whenStable();
    expect(navigationPanel(trigger)).toBeUndefined();
  });
});
