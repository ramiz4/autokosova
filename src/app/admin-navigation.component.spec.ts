import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminNavigationComponent } from './admin-navigation.component';
import { LanguageService } from './language.service';

async function render(admin: boolean) {
  await TestBed.configureTestingModule({
    imports: [AdminNavigationComponent],
    providers: [
      provideRouter([]),
      {
        provide: LanguageService,
        useValue: {
          language: 'en',
          link: (route: string, section?: string) =>
            route === 'admin-section' ? `/admin/${section}` : '/admin',
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminNavigationComponent);
  fixture.componentRef.setInput('admin', admin);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

it('uses one native mobile section select and keeps admin work grouped', async () => {
  const page = await render(true);
  const select = page.querySelector<HTMLSelectElement>('[data-staff-section-select]');
  expect(select).not.toBeNull();
  expect(Array.from(select!.options).map((option) => option.value)).toEqual([
    'overview',
    'garages',
    'users',
    'privacy',
    'audit',
    'catalog',
  ]);
  expect(page.querySelectorAll('button')).toHaveLength(0);
  expect(page.querySelector('nav a[aria-current="page"]')?.textContent).toContain('Cases');
});

it('does not expose administration paths in the moderator navigator', async () => {
  const page = await render(false);
  expect(Array.from(page.querySelectorAll('option')).map((option) => option.value)).toEqual([
    'overview',
  ]);
  expect(page.querySelectorAll('nav a')).toHaveLength(1);
});
