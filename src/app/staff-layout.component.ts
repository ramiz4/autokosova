import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminNavigationComponent } from './admin-navigation.component';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { staffCopy } from '../shared/staff-copy';
import { footerCopy } from '../shared/footer-copy';

/** Shared staff chrome. Public header/footer defaults remain owned by public pages. */
@Component({
  selector: 'app-staff-layout',
  imports: [AdminNavigationComponent, RouterLink, SiteHeaderComponent],
  template: `
    <div class="border-b border-slate-200 bg-white">
      <app-site-header [compact]="true" [active]="admin() ? 'admin' : 'moderation'" />
    </div>
    <div class="mx-auto max-w-7xl px-4 py-4 text-ink sm:px-6 sm:py-6">
      <div class="mb-4 lg:hidden">
        <app-admin-navigation [admin]="admin()" [active]="active()" />
      </div>
      <div class="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <aside class="hidden border-r border-slate-200 pr-4 lg:block">
          <app-admin-navigation [admin]="admin()" [active]="active()" />
          <div class="mt-8 grid gap-2 border-t border-slate-200 pt-4 text-sm">
            <a [routerLink]="language.link('home')" class="font-semibold text-brand-dark">{{
              copy().publicSite
            }}</a>
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-muted">
              <a [routerLink]="language.link('privacy')">{{ copy().legal }}</a>
              <a [routerLink]="language.link('terms')">{{ footer().termsTitle }}</a>
              <a [routerLink]="language.link('imprint')">{{ footer().imprintTitle }}</a>
            </div>
          </div>
        </aside>
        <main id="main-content" class="min-w-0"><ng-content /></main>
      </div>
      <div
        class="mt-8 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 pt-4 text-sm text-muted lg:hidden"
      >
        <a [routerLink]="language.link('home')" class="font-semibold text-brand-dark">{{
          copy().publicSite
        }}</a>
        <a [routerLink]="language.link('privacy')">{{ copy().legal }}</a>
        <a [routerLink]="language.link('terms')">{{ footer().termsTitle }}</a>
        <a [routerLink]="language.link('imprint')">{{ footer().imprintTitle }}</a>
      </div>
    </div>
  `,
})
export class StaffLayoutComponent {
  readonly language = inject(LanguageService);
  readonly admin = input(true);
  readonly active = input<
    'overview' | 'garages' | 'users' | 'privacy' | 'audit' | 'catalog' | 'moderation'
  >('overview');
  readonly copy = () => staffCopy(this.language.language);
  readonly footer = () => footerCopy[this.language.language];
}
