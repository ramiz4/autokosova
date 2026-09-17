import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_LANGUAGES } from '../shared/i18n';
import { routes } from './app.routes';
import { LanguageSwitcherComponent } from './language-switcher.component';

async function render(
  url = '/sq/help?topic=general#public-page-title',
  compact = true,
  placement: 'above' | 'below' = 'below',
  platformId = 'browser',
) {
  await TestBed.configureTestingModule({
    imports: [LanguageSwitcherComponent],
    providers: [provideRouter(routes), { provide: PLATFORM_ID, useValue: platformId }],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(LanguageSwitcherComponent);
  fixture.componentRef.setInput('compact', compact);
  fixture.componentRef.setInput('placement', placement);
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    component: fixture.componentInstance,
    fixture,
    page: fixture.nativeElement as HTMLElement,
  };
}

function languageLinks(scope: ParentNode): HTMLAnchorElement[] {
  return [...scope.querySelectorAll<HTMLAnchorElement>('a')];
}

afterEach(() => vi.restoreAllMocks());

it('keeps the noncompact switcher as native navigation with canonical locale links', async () => {
  const { fixture, page } = await render('/en/garages?place=pristina#results', false);
  const navigation = page.querySelector('nav')!;
  const links = languageLinks(navigation);

  expect(page.querySelector('brn-overlay')).toBeNull();
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/garages?place=pristina#results',
    '/sq/garages?place=pristina#results',
    '/en/garages?place=pristina#results',
  ]);
  expect(links.map((link) => link.textContent?.trim())).toEqual(
    APP_LANGUAGES.map(String).map((language) => language.toUpperCase()),
  );
  expect(navigation.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe(
    '/en/garages?place=pristina#results',
  );
  fixture.destroy();
});

it('opens compact native locale navigation and closes with Escape', async () => {
  const { fixture, page } = await render();
  const details = page.querySelector<HTMLDetailsElement>('details')!;
  const trigger = details.querySelector<HTMLElement>('summary')!;

  expect(details.open).toBe(false);
  trigger.click();
  await fixture.whenStable();

  const panel = details.querySelector<HTMLElement>('nav')!;
  const links = languageLinks(panel);
  expect(details.open).toBe(true);
  expect(panel.getAttribute('role')).toBeNull();
  expect(panel.querySelector('[role="dialog"], [role="menuitem"]')).toBeNull();
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/help?topic=general#public-page-title',
    '/sq/help?topic=general#public-page-title',
    '/en/help?topic=general#public-page-title',
  ]);
  expect(links[1].getAttribute('aria-current')).toBe('page');
  expect(document.activeElement).toBe(links[0]);

  links[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  await fixture.whenStable();
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
  fixture.destroy();
});

it('positions compact navigation above or below and stays closed during SSR', async () => {
  const below = await render('/', true, 'below', 'server');
  const details = below.page.querySelector<HTMLDetailsElement>('details')!;
  expect(details.open).toBe(false);
  expect(details.querySelector('nav')?.classList).toContain('top-full');
  below.fixture.componentRef.setInput('placement', 'above');
  below.fixture.detectChanges();
  expect(details.querySelector('nav')?.classList).toContain('bottom-full');
  below.fixture.destroy();
});
