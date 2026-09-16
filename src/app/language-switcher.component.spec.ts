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

it('opens compact locale navigation through the nonmodal Brain trigger and closes with Escape', async () => {
  const { fixture, page } = await render();
  const trigger = page.querySelector<HTMLButtonElement>('button[brnOverlayTrigger]')!;

  expect(page.querySelector('details, summary')).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(trigger.getAttribute('aria-haspopup')).toBeNull();
  trigger.click();
  await fixture.whenRenderingDone();

  const panel = document.querySelector<HTMLElement>('.cdk-overlay-container nav')!;
  const links = languageLinks(panel);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(trigger.getAttribute('aria-controls')).toBeTruthy();
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
  expect(document.querySelector('.cdk-overlay-container nav')).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fixture.destroy();
});

it('uses eight-pixel above-first or below-first fallback positions without opening during SSR', async () => {
  const below = await render('/', true, 'below', 'server');
  expect(below.component['state']()).toBe('closed');
  expect(below.component['positions']()).toEqual([
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ]);
  expect(document.querySelector('.cdk-overlay-container nav')).toBeNull();
  below.fixture.componentRef.setInput('placement', 'above');
  below.fixture.detectChanges();
  expect(below.component['positions']()).toEqual([
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  ]);
  below.fixture.destroy();
});
