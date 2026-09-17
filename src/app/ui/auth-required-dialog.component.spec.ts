import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../language.service';
import { AuthRequiredDialogComponent } from './auth-required-dialog.component';

afterEach(() => {
  document.body.style.overflow = '';
  TestBed.resetTestingModule();
});

it('blocks the page and exposes only the localized login action while open', async () => {
  await TestBed.configureTestingModule({
    imports: [AuthRequiredDialogComponent],
    providers: [
      {
        provide: LanguageService,
        useValue: { language: 'de', t: () => 'Login' },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AuthRequiredDialogComponent);
  fixture.componentRef.setInput('open', true);
  fixture.componentRef.setInput('loginUrl', '/auth/login?returnTo=%2Ffavorites');
  fixture.detectChanges();
  await fixture.whenStable();

  const dialog = document.querySelector<HTMLElement>('[data-auth-required-dialog]')!;
  expect(dialog.textContent).toContain('Bitte einloggen');
  expect(dialog.querySelector('[data-auth-login]')?.getAttribute('href')).toBe(
    '/auth/login?returnTo=%2Ffavorites',
  );
  expect(document.body.style.overflow).toBe('hidden');
  fixture.destroy();
  expect(document.body.style.overflow).toBe('');
});
