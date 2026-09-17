import { Component, inject, input } from '@angular/core';
import type { AdminCaseSection } from '../shared/administration';
import { AdminNavigationComponent } from './admin-navigation.component';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ToastComponent } from './ui/toast.component';
import { staffCopy } from '../shared/staff-copy';

/** Shared staff chrome. Public header/footer defaults remain owned by public pages. */
@Component({
  selector: 'app-staff-layout',
  imports: [AdminNavigationComponent, SiteHeaderComponent, ToastComponent],
  template: `
    <div class="border-b border-slate-200 bg-white">
      <app-site-header [compact]="true" [active]="admin() ? 'admin' : 'moderation'" />
    </div>
    <div class="mx-auto max-w-340 px-4 py-4 text-ink sm:px-6 sm:py-6">
      <div class="mb-4 lg:hidden">
        <app-admin-navigation [admin]="admin()" [active]="active()" />
      </div>
      <div class="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        <aside class="hidden border-r border-slate-200 pr-6 lg:block">
          <div class="sticky top-6">
            <app-admin-navigation [admin]="admin()" [active]="active()" />
          </div>
        </aside>
        <main id="main-content" class="min-w-0"><ng-content /></main>
      </div>
    </div>
    <app-toast />
  `,
})
export class StaffLayoutComponent {
  readonly language = inject(LanguageService);
  readonly admin = input(true);
  readonly active = input<
    | 'overview'
    | 'garages'
    | 'users'
    | 'privacy'
    | 'policy'
    | 'audit'
    | 'catalog'
    | AdminCaseSection
    | 'moderation'
  >('overview');
  readonly copy = () => staffCopy(this.language.language);
}
