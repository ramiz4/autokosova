import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AdminNavigationComponent } from './admin-navigation.component';
import { LanguageService } from './language.service';

async function render(admin: boolean, active?: string) {
  await TestBed.configureTestingModule({
    imports: [AdminNavigationComponent],
    providers: [
      provideRouter([]),
      {
        provide: LanguageService,
        useValue: {
          language: 'en',
          link: (route: string, section?: string) =>
            route === 'admin-section' ? `/en/admin/${section}` : `/en/${route}`,
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminNavigationComponent);
  fixture.componentRef.setInput('admin', admin);
  if (active) fixture.componentRef.setInput('active', active);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

it('uses one native mobile section select and keeps admin work grouped', async () => {
  const page = await render(true);
  const select = page.querySelector<HTMLSelectElement>('[data-staff-section-select]');
  expect(select).not.toBeNull();
  expect(Array.from(select!.options).map((option) => option.value)).toEqual([
    'overview',
    'reviews',
    'reports',
    'appeals',
    'garages',
    'users',
    'privacy',
    'policy',
    'audit',
    'catalog',
  ]);
  expect(page.querySelectorAll('button')).toHaveLength(0);
  expect(page.querySelector('nav a[aria-current="page"]')?.textContent).toContain('Dashboard');
});

it('links each domain case section to its own admin route', async () => {
  const page = await render(true, 'reviews');
  const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('nav a'));
  expect(links.find((a) => a.textContent?.includes('Reviews'))?.getAttribute('href')).toBe(
    '/en/admin/reviews',
  );
  expect(links.find((a) => a.textContent?.includes('Reports'))?.getAttribute('href')).toBe(
    '/en/admin/reports',
  );
  expect(links.find((a) => a.textContent?.includes('Appeals'))?.getAttribute('href')).toBe(
    '/en/admin/appeals',
  );
  expect(page.querySelector('nav a[aria-current="page"]')?.textContent).toContain('Reviews');
});

it('does not expose administration paths in the moderator navigator', async () => {
  const page = await render(false);
  expect(Array.from(page.querySelectorAll('option')).map((option) => option.value)).toEqual([
    'overview',
  ]);
  expect(page.querySelectorAll('nav a')).toHaveLength(1);
  expect(page.querySelector('nav a')?.getAttribute('href')).toBe('/en/moderation');
  expect(page.querySelector('nav a')?.textContent).toContain('My cases');
  expect(page.querySelector('a[href*="/admin"]')).toBeNull();
});

it('keeps the moderator mobile section change inside the assigned-case workspace', async () => {
  const page = await render(false);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const select = page.querySelector<HTMLSelectElement>('[data-staff-section-select]')!;
  select.value = 'overview';
  select.dispatchEvent(new Event('change'));
  expect(navigate).toHaveBeenCalledWith('/en/moderation');
});
