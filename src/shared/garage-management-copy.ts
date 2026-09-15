import type { AppLanguage } from './i18n';
const de = {
  draftHelp: 'Noch nicht öffentlich sichtbar.',
  pendingHelp: 'Zur Prüfung eingereicht. Noch nicht öffentlich sichtbar.',
  publishedHelp: 'In der öffentlichen Suche sichtbar.',
  rejectedHelp: 'Nicht freigegeben. Prüfe deine Angaben und reiche das Profil erneut ein.',
  suspendedHelp:
    'Gesperrt und nicht öffentlich sichtbar. Die Bearbeitung ist derzeit nicht möglich.',
  statusUnavailable:
    'Die Änderung wurde bestätigt, aber der aktuelle Status konnte nicht geladen werden. Lade das Profil erneut.',

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
    draftHelp: 'Ende nuk është i dukshëm publikisht.',
    pendingHelp: 'U dërgua për shqyrtim. Ende nuk është i dukshëm publikisht.',
    publishedHelp: 'I dukshëm në kërkimin publik.',
    rejectedHelp: 'Nuk u miratua. Kontrollo të dhënat dhe dërgoje profilin përsëri.',
    suspendedHelp:
      'I bllokuar dhe jo i dukshëm publikisht. Redaktimi aktualisht nuk është i mundur.',
    statusUnavailable:
      'Ndryshimi u konfirmua, por gjendja aktuale nuk mund të ngarkohej. Ngarko përsëri profilin.',

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
    draftHelp: 'Not publicly visible yet.',
    pendingHelp: 'Submitted for review. Not publicly visible yet.',
    publishedHelp: 'Visible in public search.',
    rejectedHelp: 'Not approved. Check your details and submit the profile again.',
    suspendedHelp: 'Suspended and not publicly visible. Editing is currently unavailable.',
    statusUnavailable:
      'The change was confirmed, but the current status could not be loaded. Reload the profile.',

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
