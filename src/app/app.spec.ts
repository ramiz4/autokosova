import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FoundationComponent } from './app';
import { AnalyticsService } from './analytics.service';
import { landingCopy } from '../shared/landing-copy';

describe('Homepage', () => {
  let analytics: {
    consented: boolean;
    track: ReturnType<typeof vi.fn>;
    setConsent: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    analytics = { consented: false, track: vi.fn(), setConsent: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [FoundationComponent],
      providers: [
        provideRouter([
          { path: 'sq', component: FoundationComponent },
          { path: 'inquiry', component: FoundationComponent },
          { path: 'en', component: FoundationComponent },
        ]),
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(FoundationComponent);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  it('offers the request and direct public search without fictional social proof', async () => {
    const { page } = await render();
    expect(page.querySelector('header img')?.getAttribute('src')).toBe(
      '/branding/autokosova-logo-header.png',
    );
    expect(page.querySelector('h1')?.textContent).toContain('Schon vor der Reise.');
    expect(page.textContent).not.toContain('Gjithmonë një hap më afër shtëpisë.');
    expect(page.textContent).not.toContain('AUTOKOSOVA');
    expect(
      [...page.querySelectorAll<HTMLAnchorElement>('a[href="/inquiry"]')].some((link) =>
        link.textContent?.includes('Jetzt Anfrage erstellen'),
      ),
    ).toBe(true);
    expect(page.querySelector('form#werkstatt-suche')).toBeTruthy();
    expect(page.textContent).toContain('ohne Konto');
    expect(page.textContent).not.toMatch(/10[’']000|500\+|Reparaturgarantie|Arben/);
    expect(page.querySelector('picture img')?.getAttribute('fetchpriority')).toBe('high');
    for (const id of ['werkstatt-suche', 'so-funktionierts', 'ueber-uns']) {
      expect(page.querySelector('#' + id)).toBeTruthy();
      expect(
        page.querySelector(
          'header a[href="' + (id === 'werkstatt-suche' ? '/garages' : '/#' + id) + '"]',
        ),
      ).toBeTruthy();
    }
  });

  it('keeps menu state accessible, closes on Escape and restores focus', async () => {
    const { fixture, page } = await render();
    const toggle = page.querySelector<HTMLButtonElement>(
      'button[aria-controls="mobile-navigation"]',
    )!;
    const menu = page.querySelector<HTMLElement>('#mobile-navigation')!;
    expect(menu.hidden).toBe(true);
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);
    menu.querySelector('a')!.focus();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    await fixture.whenStable();
    menu
      .querySelector('a')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(menu.hidden).toBe(true);
  });

  it('starts the faster search with only the selected location and radius', async () => {
    const { fixture, page } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const form = page.querySelector('form')!;
    const radius = page.querySelector<HTMLInputElement>('#search-radius')!;
    fixture.componentInstance['radiusKm'] = 101;
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('100');
    expect(navigate).not.toHaveBeenCalled();
    radius.value = '30';
    radius.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/garages'], {
      queryParams: { places: 'xk-pristina:30' },
    });
    expect(analytics.track).toHaveBeenCalledExactlyOnceWith('search_started');
  });

  it('preserves localized request, section and language destinations', async () => {
    await TestBed.inject(Router).navigateByUrl('/sq');
    const { page } = await render();
    expect(page.querySelector('h1')?.textContent).toContain('Para se të nisesh.');
    expect(page.querySelector('a[href="/sq/inquiry"]')).toBeTruthy();
    expect(page.querySelector('header a[href="/sq/garages"]')).toBeTruthy();
    expect(page.querySelector('header a[href="/en"]')?.textContent).toContain('English');
    expect(page.querySelector('header a[aria-current="page"]')?.textContent).toContain('Shqip');
  });

  it('keeps optional analytics a deliberate, reversible choice', async () => {
    const { fixture, page } = await render();
    const button = page.querySelector<HTMLButtonElement>('footer button')!;
    expect(analytics.setConsent).not.toHaveBeenCalled();
    button.click();
    await fixture.whenStable();
    expect(analytics.setConsent).toHaveBeenCalledWith(true);
    analytics.consented = true;
    button.click();
    await fixture.whenStable();
    expect(analytics.setConsent).toHaveBeenLastCalledWith(false);
  });

  it('provides complete DE/SQ/EN strings for the new shared shell', () => {
    for (const locale of ['sq', 'en'] as const) {
      expect(Object.keys(landingCopy[locale]).sort()).toEqual(Object.keys(landingCopy.de).sort());
      expect(Object.values(landingCopy[locale]).every((value) => value.trim().length > 0)).toBe(
        true,
      );
    }
  });
  it('docks the floating landing header at its inset and restores it on scrolling back', async () => {
    const scrollDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY')!;
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
    try {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      const { fixture } = await render();
      expect(fixture.componentInstance['navbarDocked']()).toBe(false);
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 54 });
      window.dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
      expect(fixture.componentInstance['navbarDocked']()).toBe(true);
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
      window.dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
      expect(fixture.componentInstance['navbarDocked']()).toBe(false);
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 20 });
      window.dispatchEvent(new Event('resize'));
      await fixture.whenStable();
      expect(fixture.componentInstance['navbarDocked']()).toBe(true);
    } finally {
      Object.defineProperty(window, 'scrollY', scrollDescriptor);
      Object.defineProperty(window, 'innerWidth', widthDescriptor);
    }
  });
});
