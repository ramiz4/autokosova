import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LanguageService } from './language.service';
import { adminLabel } from '../shared/admin-copy';
import { staffCopy } from '../shared/staff-copy';
import type { AdminCaseSection } from '../shared/administration';

type Section =
  'overview' | AdminCaseSection | 'garages' | 'users' | 'privacy' | 'audit' | 'catalog';

/** One compact internal navigator; it deliberately has no role-switching controls. */
@Component({
  selector: 'app-admin-navigation',
  imports: [RouterLink],
  template: `
    <nav class="hidden lg:block" [attr.aria-label]="adminLabel('administration')">
      @for (group of groups(); track group.label) {
        <section class="mb-5">
          @if (group.label) {
            <p class="mb-2 px-3 text-xs font-bold tracking-wide text-muted uppercase">
              {{ group.label }}
            </p>
          }
          <div class="grid gap-1">
            @for (section of group.sections; track section) {
              <a
                class="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-brand-dark hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                [class.bg-blue-50]="active() === section"
                [attr.aria-current]="active() === section ? 'page' : null"
                [routerLink]="path(section)"
                >{{ label(section) }}</a
              >
            }
          </div>
        </section>
      }
    </nav>
    <label class="block lg:hidden">
      <span class="mb-1 block text-sm font-semibold text-ink">{{
        adminLabel('workspaceSection')
      }}</span>
      <select
        data-staff-section-select
        class="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-semibold text-brand-dark"
        [value]="active()"
        (change)="go($event)"
      >
        @for (group of groups(); track group.label) {
          <optgroup [label]="group.label || adminLabel('administration')">
            @for (section of group.sections; track section) {
              <option [value]="section" [selected]="active() === section">
                {{ label(section) }}
              </option>
            }
          </optgroup>
        }
      </select>
    </label>
  `,
})
export class AdminNavigationComponent {
  readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  readonly active = input<Section | 'moderation'>('overview');
  readonly admin = input(true);
  readonly staffCopy = staffCopy;
  groups(): readonly { readonly label: string; readonly sections: readonly Section[] }[] {
    if (!this.admin()) return [{ label: '', sections: ['overview'] }];
    return [
      { label: '', sections: ['overview', 'reviews', 'reports', 'appeals', 'garages', 'users'] },
      { label: this.adminLabel('administration'), sections: ['privacy', 'audit', 'catalog'] },
    ];
  }
  label(section: Section): string {
    return section === 'overview'
      ? this.admin()
        ? adminLabel('overview', this.language.language)
        : staffCopy(this.language.language).myCases
      : section === 'catalog'
        ? adminLabel('settings', this.language.language)
        : adminLabel(section, this.language.language);
  }
  adminLabel(key: string): string {
    return adminLabel(key, this.language.language);
  }
  path(section: Section): string {
    if (!this.admin()) return this.language.link('moderation');
    return section === 'overview'
      ? this.language.link('admin')
      : this.language.link('admin-section', section);
  }
  go(event: Event): void {
    const section = (event.target as HTMLSelectElement).value as Section;
    const control = event.target as HTMLSelectElement;
    void this.router.navigateByUrl(this.path(section)).then(() => {
      control.value = this.active();
    });
  }
}
