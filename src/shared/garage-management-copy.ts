import type { AppLanguage } from './i18n';
const de = {
  edit: 'Bearbeiten',
  back: 'Zur Übersicht',
  viewPublic: 'Öffentliches Profil ansehen',
  loading: 'Werkstätten werden geladen …',
  retry: 'Erneut laden',

  intro: 'Verwalte deine Werkstätten, Kontaktdaten und angebotenen Dienstleistungen.',
  title: 'Meine Werkstätten',
  editTitle: 'Werkstatt bearbeiten',
  create: 'Neue Werkstatt anlegen',
  remove: 'Werkstatt löschen',
  empty: 'Dir sind noch keine Werkstätten zugewiesen. Lege deine erste Werkstatt an.',
  confirm:
    'Werkstatt „{name}“ löschen? Sie wird aus der öffentlichen Suche und deiner Verwaltung entfernt. Ungespeicherte Änderungen werden verworfen. Bestehende Bewertungen und Nachweise bleiben für die Moderation erhalten.',
  deleted: 'Die Werkstatt wurde aus der Suche und deiner Verwaltung entfernt.',
};
export const garageManagementCopy: Readonly<Record<AppLanguage, typeof de>> = {
  de,
  sq: {
    edit: 'Redakto',
    back: 'Kthehu te përmbledhja',
    viewPublic: 'Shiko profilin publik',
    loading: 'Serviset po ngarkohen …',
    retry: 'Ngarko përsëri',

    intro: 'Menaxho serviset e tua, të dhënat e kontaktit dhe shërbimet e ofruara.',
    title: 'Serviset e mia',
    editTitle: 'Redakto servisin',
    create: 'Shto një servis të ri',
    remove: 'Fshi servisin',
    empty: 'Ende nuk ke servise të caktuara. Shto servisin tënd të parë.',
    confirm:
      'Të fshihet servisi „{name}“? Do të hiqet nga kërkimi publik dhe administrimi yt. Ndryshimet e paruajtura do të humbin. Vlerësimet dhe dëshmitë ekzistuese ruhen për moderim.',
    deleted: 'Servisi u hoq nga kërkimi dhe administrimi yt.',
  },
  en: {
    edit: 'Edit',
    back: 'Back to overview',
    viewPublic: 'View public profile',
    loading: 'Loading garages …',
    retry: 'Load again',

    intro: 'Manage your garages, contact details and offered services.',
    title: 'My garages',
    editTitle: 'Edit garage',
    create: 'Add a new garage',
    remove: 'Delete garage',
    empty: 'You have no assigned garages yet. Add your first garage.',
    confirm:
      'Delete garage “{name}”? It will be removed from public search and your management list. Unsaved changes will be discarded. Existing reviews and evidence are retained for moderation.',
    deleted: 'The garage was removed from search and your management list.',
  },
};
