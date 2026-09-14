import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SiteHeaderComponent } from './site-header.component';

describe('Header account actions', () => {
  it.each(['', 'sq', 'en'])(
    'links login and registration directly to OIDC for /%s',
    async (locale) => {
      await TestBed.configureTestingModule({
        imports: [SiteHeaderComponent],
        providers: [provideRouter([{ path: locale, component: SiteHeaderComponent }])],
      }).compileComponents();
      await TestBed.inject(Router).navigateByUrl('/' + locale);
      const fixture = TestBed.createComponent(SiteHeaderComponent);
      await fixture.whenStable();
      const page = fixture.nativeElement as HTMLElement;
      const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('a[href^="/auth/login"]'));
      expect(links).toHaveLength(4);
      const returnTo = locale ? '/' + locale + '/inquiry' : '/inquiry';
      for (const [index, link] of links.entries()) {
        const url = new URL(link.href);
        expect(url.pathname).toBe('/auth/login');
        expect(url.searchParams.get('returnTo')).toBe(returnTo);
        expect(url.searchParams.get('prompt')).toBe(index % 2 ? 'create' : null);
      }
      expect(page.querySelector('[aria-live]')).toBeNull();
    },
  );
});
