import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from './language.service';
import { adminLabel } from '../shared/admin-copy';
@Component({
  selector: 'app-admin-navigation',
  imports: [RouterLink],
  template: ` <nav class="my-6 flex flex-wrap gap-2" [attr.aria-label]="label('administration')">
    @for (section of sections; track section) {
      <a
        class="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        [routerLink]="path(section)"
        [attr.aria-current]="active() === section ? 'page' : null"
        >{{ label(section) }}</a
      >
    }
  </nav>`,
})
export class AdminNavigationComponent {
  readonly language = inject(LanguageService);
  readonly active = input('overview');
  readonly sections = [
    'overview',
    'garages',
    'users',
    'privacy',
    'audit',
    'catalog',
    'support',
  ] as const;
  label(key: string) {
    return adminLabel(key, this.language.language);
  }
  path(section: string) {
    return this.language.link('admin') + (section === 'overview' ? '' : '/' + section);
  }
}
