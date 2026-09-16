import type { AppLanguage } from './i18n';

// Keep only shell/shared account strings here: this catalog is part of the initial bundle.
const de = {
  'account.profileTitle': 'Profil & Einstellungen',
  'account.signedInAs': 'Angemeldet als',
  'account.loading': 'Konto wird geladen …',
  'account.loadError': 'Dein Kontostatus konnte nicht geladen werden. Bitte versuche es erneut.',
  'account.guest': 'Du bist nicht angemeldet oder deine Sitzung ist abgelaufen.',
  'account.loginUnavailable':
    'Die Anmeldung ist in dieser Umgebung noch nicht eingerichtet. Die öffentliche Suche bleibt verfügbar.',
  'account.type.customer': 'Privatkunde',
  'account.type.garage': 'Werkstattbetreiber',
  'account.myGarages': 'Meine Werkstätten',
} as const;

export const accountCopy: Readonly<Record<AppLanguage, Readonly<Record<keyof typeof de, string>>>> =
  {
    de,
    sq: {
      'account.profileTitle': 'Profili & cilësimet',
      'account.signedInAs': 'I identifikuar si',
      'account.loading': 'Llogaria po ngarkohet …',
      'account.loadError': 'Gjendja e llogarisë nuk mund të ngarkohej. Provo përsëri.',
      'account.guest': 'Nuk je i identifikuar ose sesioni yt ka skaduar.',
      'account.loginUnavailable':
        'Identifikimi nuk është konfiguruar ende në këtë mjedis. Kërkimi publik mbetet i disponueshëm.',
      'account.type.customer': 'Klient privat',
      'account.type.garage': 'Operator servisi',
      'account.myGarages': 'Serviset e mia',
    },
    en: {
      'account.profileTitle': 'Profile & settings',
      'account.signedInAs': 'Signed in as',
      'account.loading': 'Loading account …',
      'account.loadError': 'Your account status could not be loaded. Please try again.',
      'account.guest': 'You are not signed in or your session has expired.',
      'account.loginUnavailable':
        'Sign-in has not been configured in this environment. Public search is still available.',
      'account.type.customer': 'Private customer',
      'account.type.garage': 'Garage operator',
      'account.myGarages': 'My garages',
    },
  };
