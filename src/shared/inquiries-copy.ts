const de = {
  title: 'Meine Anfragen',
  description:
    'Deine privat gespeicherten Suchanfragen. Sie sind keine gesendeten Nachrichten, Angebote, Termine oder Aufträge.',
  savedOn: 'Gespeichert am',
  emptyTitle: 'Noch keine gespeicherten Anfragen',
  empty:
    'Hier erscheinen nur Anfragen, die du in diesem Konto gespeichert hast. Ein lokaler Browserentwurf gehört nicht dazu.',
  view: 'Anfrage ansehen',
  close: 'Details schließen',
  find: 'Passende Werkstätten finden',
  more: 'Weitere Anfragen laden',
  loadError: 'Deine Anfragen konnten nicht geladen werden. Bitte versuche es erneut.',
  missing: 'Diese Anfrage ist nicht mehr verfügbar. Aktualisiere die Übersicht.',
  refresh: 'Übersicht aktualisieren',
  detailError: 'Die gespeicherten Angaben konnten nicht geladen werden.',
  login:
    'Melde dich an, um deine gespeicherten Anfragen zu sehen. Danach kehrst du hierher zurück.',
  expired:
    'Deine Sitzung ist abgelaufen oder wurde beendet. Melde dich erneut an, um deine Anfragen zu sehen.',
  allKosovo: 'Ganz Kosovo',
  areas: 'Suchorte',
  savedDetails: 'Gespeicherte Angaben',
  original: 'Deine Angaben werden unverändert in ihrer ursprünglichen Sprache angezeigt.',
  attachments: 'Gespeicherte private Anhänge',
  noAttachments: 'Keine Anhänge gespeichert',
  attachmentsHelp: 'Es werden keine privaten Dateien öffentlich verlinkt.',
  searchHelp:
    'Die Suche übernimmt nur Leistung, Orte und Radien. Dein Browserentwurf bleibt unverändert.',
};
export type InquiriesCopyKey = keyof typeof de;
export const inquiriesCopy: Readonly<
  Record<'de' | 'sq' | 'en', Readonly<Record<InquiriesCopyKey, string>>>
> = {
  de,
  sq: {
    title: 'Kërkesat e mia',
    description:
      'Kërkesat e tua të kërkimit, të ruajtura privatisht. Ato nuk janë mesazhe të dërguara, oferta, termine apo porosi.',
    savedOn: 'Ruajtur më',
    emptyTitle: 'Ende nuk ka kërkesa të ruajtura',
    empty:
      'Këtu shfaqen vetëm kërkesat që i ke ruajtur në këtë llogari. Një draft lokal në shfletues nuk përfshihet.',
    view: 'Shiko kërkesën',
    close: 'Mbyll detajet',
    find: 'Gjej servise të përshtatshme',
    more: 'Ngarko kërkesa të tjera',
    loadError: 'Kërkesat e tua nuk mund të ngarkoheshin. Provo përsëri.',
    missing: 'Kjo kërkesë nuk është më e disponueshme. Rifresko përmbledhjen.',
    refresh: 'Rifresko përmbledhjen',
    detailError: 'Të dhënat e ruajtura nuk mund të ngarkoheshin.',
    login: 'Hyr në llogari për të parë kërkesat e ruajtura. Pastaj do të kthehesh këtu.',
    expired: 'Sesioni yt ka skaduar ose është përfunduar. Hyr përsëri për të parë kërkesat e tua.',
    allKosovo: 'Gjithë Kosova',
    areas: 'Vendet e kërkimit',
    savedDetails: 'Të dhënat e ruajtura',
    original: 'Të dhënat e tua shfaqen të pandryshuara në gjuhën origjinale.',
    attachments: 'Bashkëngjitjet private të ruajtura',
    noAttachments: 'Nuk ka bashkëngjitje të ruajtura',
    attachmentsHelp: 'Skedarët privatë nuk lidhen publikisht.',
    searchHelp:
      'Kërkimi merr vetëm shërbimin, vendet dhe rrezet. Drafti yt në shfletues mbetet i pandryshuar.',
  },
  en: {
    title: 'My inquiries',
    description:
      'Your privately saved search inquiries. These are not sent messages, quotes, appointments or orders.',
    savedOn: 'Saved on',
    emptyTitle: 'No saved inquiries yet',
    empty:
      'Only inquiries you saved to this account appear here. A local browser draft is not included.',
    view: 'View inquiry',
    close: 'Close details',
    find: 'Find matching garages',
    more: 'Load more inquiries',
    loadError: 'Your inquiries could not be loaded. Please try again.',
    missing: 'This inquiry is no longer available. Refresh the overview.',
    refresh: 'Refresh overview',
    detailError: 'The saved details could not be loaded.',
    login: 'Sign in to view your saved inquiries. You will return here afterwards.',
    expired: 'Your session has expired or ended. Sign in again to view your inquiries.',
    allKosovo: 'All of Kosovo',
    areas: 'Search locations',
    savedDetails: 'Saved details',
    original: 'Your information is shown unchanged in its original language.',
    attachments: 'Saved private attachments',
    noAttachments: 'No saved attachments',
    attachmentsHelp: 'Private files are not linked publicly.',
    searchHelp:
      'Search uses only the service, places and radii. Your browser draft stays unchanged.',
  },
};
