import type { AppLanguage } from './i18n';

export type MonetizationCardId = 'drivers' | 'profiles';

interface CardCopy {
  readonly title: string;
  readonly description: string;
  readonly points: readonly string[];
  readonly action: string;
}

export interface MonetizationCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly currentLabel: string;
  readonly pilotNotice: string;
  readonly cards: Readonly<Record<MonetizationCardId, CardCopy>>;
  readonly principlesTitle: string;
  readonly principlesBody: string;
  readonly verificationNotice: string;
  readonly contactNotice: string;
  readonly feesNotice: string;
  readonly searchAction: string;
}

export const monetizationCopy: Readonly<Record<AppLanguage, MonetizationCopy>> = {
  de: {
    title: 'Kosten & Fairness',
    subtitle: 'Kostenlos starten. Fair auswählen.',
    description:
      'Was AutoKosova in der aktuellen Phase kostenlos anbietet und warum du deine Werkstatt unabhängig auswählen kannst.',
    currentLabel: 'Aktuelle kostenlose Phase',
    pilotNotice:
      'AutoKosova befindet sich in der nicht öffentlichen Entwicklungsphase. Der geplante Pilot ist kostenfrei; sein öffentlicher Start steht noch aus.',
    cards: {
      drivers: {
        title: 'Für Autofahrer',
        description:
          'Suche, Profile, selbst gewählter Kontakt und Bewertungen sind in der aktuellen Phase kostenlos. Reparaturkosten vereinbarst du direkt mit der Werkstatt.',
        points: [
          'Werkstätten und Profile ohne Konto ansehen',
          'Telefon oder WhatsApp bewusst selbst auswählen',
          'Bewertungen mit Anmeldung und privatem Besuchsnachweis einreichen',
        ],
        action: 'Werkstätten finden',
      },
      profiles: {
        title: 'Für Werkstätten',
        description:
          'Das Basisprofil mit Leistungen, Kontaktdaten und Bewertungen ist in der aktuellen Phase und im geplanten Pilot kostenlos.',
        points: [
          'Einen privaten Werkstattentwurf anlegen',
          'Das Profil gesondert zur Prüfung einreichen',
          'Veröffentlichung erst nach Prüfung und Freigabe',
        ],
        action: 'Zur Werkstattaufnahme',
      },
    },
    principlesTitle: 'Vertrauen steht nicht zum Verkauf.',
    principlesBody:
      'Die organische Suchreihenfolge, Bewertungen, Besuchsnachweise, Unternehmensprüfung und Moderation sind nicht käuflich. Auch kostenlose veröffentlichte Profile bleiben auffindbar und erreichbar.',
    verificationNotice:
      'Geprüfte Unternehmensdaten und ein belegter Werkstattbesuch sind unterschiedliche Aussagen. Beides ist keine Reparaturqualitätsgarantie.',
    contactNotice:
      'Du wählst die Werkstatt und den Kontaktkanal selbst. Ein Kontaktklick sendet keine Nachricht und bucht keinen Termin.',
    feesNotice:
      'In der aktuellen Phase gibt es bei AutoKosova keine Abonnements, Werbung, Zahlungsabwicklung oder Erfolgsprovisionen.',
    searchAction: 'Zur Werkstattsuche',
  },
  sq: {
    title: 'Kostot dhe drejtësia',
    subtitle: 'Fillo falas. Zgjidh në mënyrë të drejtë.',
    description:
      'Çfarë ofron AutoKosova falas në fazën aktuale dhe pse mund ta zgjedhësh servisin në mënyrë të pavarur.',
    currentLabel: 'Faza aktuale falas',
    pilotNotice:
      'AutoKosova është në fazën e zhvillimit, ende jo publik. Piloti i planifikuar është falas; fillimi i tij publik nuk është miratuar ende.',
    cards: {
      drivers: {
        title: 'Për shoferët',
        description:
          'Kërkimi, profilet, kontakti i zgjedhur vetë dhe vlerësimet janë falas në fazën aktuale. Kostot e riparimit i dakordon drejtpërdrejt me servisin.',
        points: [
          'Shiko serviset dhe profilet pa llogari',
          'Zgjidh vetë telefonin ose WhatsApp',
          'Dërgo vlerësime pas hyrjes, me dëshmi private të vizitës',
        ],
        action: 'Gjej servise',
      },
      profiles: {
        title: 'Për serviset',
        description:
          'Profili bazë me shërbimet, të dhënat e kontaktit dhe vlerësimet është falas në fazën aktuale dhe në pilotin e planifikuar.',
        points: [
          'Krijo një draft privat të servisit',
          'Dërgo profilin veçmas për kontroll',
          'Publikim vetëm pas kontrollit dhe miratimit',
        ],
        action: 'Regjistro servisin',
      },
    },
    principlesTitle: 'Besimi nuk është në shitje.',
    principlesBody:
      'Renditja organike, vlerësimet, dëshmitë e vizitave, kontrolli i biznesit dhe moderimi nuk blihen. Edhe profilet e publikuara falas mbeten të gjendshme dhe të kontaktueshme.',
    verificationNotice:
      'Të dhënat e kontrolluara të biznesit dhe vizita e dëshmuar në servis janë dy gjëra të ndryshme. Asnjëra nuk garanton cilësinë e riparimit.',
    contactNotice:
      'Ti zgjedh vetë servisin dhe mënyrën e kontaktit. Një klikim kontakti nuk dërgon mesazh dhe nuk rezervon termin.',
    feesNotice:
      'Në fazën aktuale, AutoKosova nuk ka abonime, reklama, përpunim pagesash ose komisione për riparimet.',
    searchAction: 'Kërko servise',
  },
  en: {
    title: 'Costs & fairness',
    subtitle: 'Start for free. Choose fairly.',
    description:
      'What AutoKosova offers for free in the current phase and why you can choose your garage independently.',
    currentLabel: 'Current free phase',
    pilotNotice:
      'AutoKosova is in non-public development. The planned pilot is free; its public launch has not been approved yet.',
    cards: {
      drivers: {
        title: 'For drivers',
        description:
          'Search, profiles, independently chosen contact and reviews are free in the current phase. You agree repair costs directly with the garage.',
        points: [
          'View garages and profiles without an account',
          'Choose phone or WhatsApp yourself',
          'Submit reviews after signing in, with private visit evidence',
        ],
        action: 'Find garages',
      },
      profiles: {
        title: 'For garages',
        description:
          'The basic profile with services, contact details and reviews is free in the current phase and the planned pilot.',
        points: [
          'Create a private garage draft',
          'Submit the profile for review as a separate step',
          'Publication only after review and approval',
        ],
        action: 'Register a garage',
      },
    },
    principlesTitle: 'Trust is not for sale.',
    principlesBody:
      'Organic search order, reviews, visit evidence, business verification and moderation cannot be purchased. Free published profiles remain discoverable and contactable.',
    verificationNotice:
      'Verified business details and an evidenced garage visit are different statements. Neither guarantees repair quality.',
    contactNotice:
      'You choose the garage and contact channel yourself. A contact click does not send a message or book an appointment.',
    feesNotice:
      'In the current phase, AutoKosova has no subscriptions, advertising, payment processing or repair commissions.',
    searchAction: 'Search for garages',
  },
};
