import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { filter } from 'rxjs';
import { PUBLIC_PAGE_PATHS, isPublicPageId, type PublicPageId } from '../shared/public-pages';
import {
  APP_LANGUAGES,
  type AppLanguage,
  LANGUAGE_LABELS,
  localizedServiceLabel,
  translate,
} from '../shared/i18n';

export type AppRoute = 'home' | 'onboarding' | 'request' | 'search' | 'garage' | PublicPageId;

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly languages = APP_LANGUAGES;
  readonly languageLabels = LANGUAGE_LABELS;

  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly navigationEnd = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
  );
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  constructor() {
    this.applyDocumentLanguage();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.applyDocumentLanguage();
    });
  }

  get language(): AppLanguage {
    // Persistent shell components also need to update with zoneless change detection.
    this.navigationEnd();
    return languageFromUrl(this.router.url);
  }

  link(route: AppRoute, parameter?: string): string {
    return routePath(this.language, route, parameter);
  }

  serviceLabel(serviceId: string): string {
    return localizedServiceLabel(this.language, serviceId);
  }

  switchUrl(target: AppLanguage): string {
    this.navigationEnd();
    const current = this.router.url || this.browserPath();
    const suffixAt = current.search(/[?#]/);
    const path = suffixAt < 0 ? current : current.slice(0, suffixAt);
    const suffix = suffixAt < 0 ? '' : current.slice(suffixAt);
    const { parameter, route } = identifyRoute(path);
    return `${routePath(target, route, parameter)}${suffix}`;
  }

  t(key: string, replacements?: Readonly<Record<string, string | number>>): string {
    return translate(this.language, key, replacements);
  }

  setPage(titleKey: string, descriptionKey: string, noIndex = false): void {
    this.title.setTitle(`${this.t(titleKey)} | AutoKosova`);
    this.meta.updateTag({ content: this.t(descriptionKey), name: 'description' });
    if (noIndex) this.meta.updateTag({ content: 'noindex, nofollow', name: 'robots' });
    else this.meta.removeTag("name='robots'");
  }

  setProfilePage(name: string, description?: string): void {
    this.title.setTitle(`${name} | AutoKosova`);
    this.meta.updateTag({
      content: description?.trim() || `${this.t('profile.profile')} in Kosovo`,
      name: 'description',
    });
    this.meta.removeTag("name='robots'");
  }

  private applyDocumentLanguage(): void {
    this.document.documentElement.lang = this.language;
  }

  private browserPath(): string {
    if (!isPlatformBrowser(this.platformId)) return '/';
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }
}

export function languageFromUrl(url: string): AppLanguage {
  const path = url.split(/[?#]/, 1)[0];
  if (path === '/sq' || path.startsWith('/sq/')) return 'sq';
  if (path === '/en' || path.startsWith('/en/')) return 'en';
  return 'de';
}

export function routePath(language: AppLanguage, route: AppRoute, parameter?: string): string {
  const base = language === 'de' ? '' : `/${language}`;
  const segments: Readonly<Record<AppRoute, string>> = {
    ...PUBLIC_PAGE_PATHS,
    home: '',
    onboarding: '/garages/new',
    request: '/inquiry',
    search: '/garages',
    garage: `/garages/${encodeURIComponent(parameter ?? '')}`,
  };
  return `${base}${segments[route]}` || '/';
}

function identifyRoute(path: string): { readonly parameter?: string; readonly route: AppRoute } {
  const normalized = path.replace(/^\/(?:sq|en)(?=\/|$)/, '') || '/';
  if (normalized === '/') return { route: 'home' };
  if (normalized === '/garages/new') return { route: 'onboarding' };
  if (normalized === '/inquiry') return { route: 'request' };
  if (normalized === '/garages' || normalized === '/suche' || normalized === '/werkstaetten') {
    return { route: 'search' };
  }
  for (const [page, pagePath] of Object.entries(PUBLIC_PAGE_PATHS)) {
    if (normalized === pagePath && isPublicPageId(page)) return { route: page };
  }
  const garage = normalized.match(/^\/garages\/([^/]+)$/);
  return garage ? { parameter: garage[1], route: 'garage' } : { route: 'home' };
}
