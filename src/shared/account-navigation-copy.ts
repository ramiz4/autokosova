import type { AppLanguage } from './i18n';

// Keep shell labels independent of the lazy staff and review feature catalogs.
const labels = {
  de: { admin: 'Administration', moderation: 'Moderation', reviews: 'Meine Bewertungen' },
  en: { admin: 'Administration', moderation: 'Moderation', reviews: 'My reviews' },
  sq: { admin: 'Administrimi', moderation: 'Moderimi', reviews: 'Vlerësimet e mia' },
} as const;

export function accountNavigationCopy(language: AppLanguage) {
  return labels[language];
}
