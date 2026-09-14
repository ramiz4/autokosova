import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { footerCopy, type FooterCopyKey } from '../shared/footer-copy';
import { isPublicPageId, type PublicPageId } from '../shared/public-pages';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';

@Component({
  imports: [RouterLink, SiteHeaderComponent],
  template: `
    <div class="site-navbar-surface sticky top-0 z-50 px-3 lg:px-8">
      <app-site-header [compact]="true" />
    </div>
    <main
      class="mx-auto min-h-[50dvh] max-w-4xl px-6 py-12 text-ink sm:px-10 sm:py-16"
      aria-labelledby="public-page-title"
    >
      <p class="text-sm font-bold text-brand-dark">{{ text('provisional') }}</p>
      <h1 id="public-page-title" class="mt-3 text-3xl font-bold break-words sm:text-4xl">
        {{ title }}
      </h1>
      <p class="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 leading-7">
        {{ text(isLegal ? 'legalPending' : 'pending') }}
      </p>
      <p class="mt-6 leading-7 text-slate-600">{{ description }}</p>
      <a
        [routerLink]="language.link('home')"
        class="mt-8 inline-flex min-h-11 items-center rounded font-semibold text-brand-dark underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >{{ text('back') }}</a
      >
    </main>
  `,
})
export class PublicPageComponent {
  protected readonly language = inject(LanguageService);
  protected readonly pageId: PublicPageId;
  protected readonly isLegal: boolean;

  constructor() {
    const pageId: unknown = inject(ActivatedRoute).snapshot.data['publicPage'];
    if (!isPublicPageId(pageId)) throw new Error('Missing public page route configuration');
    this.pageId = pageId;
    this.isLegal = ['privacy', 'terms', 'imprint'].includes(pageId);
    inject(Title).setTitle(`${this.title} | AutoKosova`);
    const meta = inject(Meta);
    meta.updateTag({ name: 'description', content: this.description });
    // Provisional content is not an approved/indexable legal document.
    meta.updateTag({ name: 'robots', content: 'noindex, follow' });
  }

  protected get title(): string {
    return this.text(`${this.pageId}Title`);
  }

  protected get description(): string {
    return this.text(`${this.pageId}Body`);
  }

  protected text(key: FooterCopyKey): string {
    return footerCopy[this.language.language][key];
  }
}
