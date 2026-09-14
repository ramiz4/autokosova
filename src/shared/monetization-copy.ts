import type { AppLanguage } from './i18n';

export type MonetizationCardId = 'profiles' | 'tools' | 'drivers' | 'partners';

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
  readonly benefits: readonly string[];
  readonly currentLabel: string;
  readonly futureLabel: string;
  readonly pilotNotice: string;
  readonly cards: Readonly<Record<MonetizationCardId, CardCopy>>;
  readonly principlesTitle: string;
  readonly principlesBody: string;
  readonly conditions: string;
  readonly closingTitle: string;
  readonly closingBody: string;
  readonly searchAction: string;
  readonly onboardingAction: string;
}

export const monetizationCopy: Readonly<Record<AppLanguage, MonetizationCopy>> = {
  de: {
    title: 'Monetarisierung',
    subtitle: 'Ein faires Modell. Klare Entscheidungen.',
    description:
      'Kostenlose Grundlagen für Kunden und Werkstätten. Mögliche spätere Einnahmen entstehen nur durch zusätzliche Leistungen, nicht durch gekaufte Empfehlungen.',
    benefits: ['Kostenloser Pilot', 'Freie Werkstattwahl', 'Keine gekauften Rankings'],
    currentLabel: 'Kostenlose Pilotgrundlage',
    futureLabel: 'Zukunftsidee · noch zu prüfen',
    pilotNotice:
      'Der öffentliche Pilot ist noch nicht freigegeben. Diese Seite erklärt die kostenlose Grundlage und mögliche spätere Schritte, keine buchbaren Pakete.',
    cards: {
      profiles: {
        title: 'Werkstattprofile',
        description:
          'Das Basisprofil ist im Pilot kostenlos. Ein späteres Pro-Abo wäre optional und ist noch nicht beschlossen.',
        points: [
          'Leistungen, Kontakt und Bewertungen im Basisprofil',
          'Veröffentlichung erst nach erfolgreicher Prüfung',
          'Auch ohne Abo auffindbar und erreichbar',
        ],
        action: 'Werkstattaufnahme öffnen',
      },
      tools: {
        title: 'Zusätzliche Werkzeuge',
        description:
          'Mögliche Pro-Werkzeuge werden erst nach belegtem Nutzen und Zahlungsbereitschaft geprüft. Sie sind noch kein verfügbares Angebot.',
        points: [
          'Auswertung eigener Kontaktabsichten',
          'Erweitertes Foto- und Leistungsportfolio',
          'Mehrsprachige und administrative Unterstützung',
        ],
        action: 'Voraussetzungen lesen',
      },
      drivers: {
        title: 'Für Autofahrer kostenlos',
        description:
          'Suche, Profile, gewählter Kontakt und Bewertungen bleiben für Kunden kostenlos. Für Bewertungen gelten weiterhin die Anmelde- und Nachweisregeln.',
        points: [
          'Werkstätten ohne Konto suchen und vergleichen',
          'WhatsApp oder Telefon selbst auswählen',
          'Erfahrungen ohne Plattformgebühr bewerten',
        ],
        action: 'Werkstätten finden',
      },
      partners: {
        title: 'Mögliche Kooperationen',
        description:
          'Kooperationen und Werbung sind lediglich Zukunftsideen. Hier werden keine bestätigten Partnerschaften oder aktiven Werbeangebote dargestellt.',
        points: [
          'Zusammenarbeit erst nach Prüfung und Freigabe',
          'Werbung klar als Anzeige kennzeichnen',
          'Keine bevorzugte organische Suchposition',
        ],
        action: 'Einordnung lesen',
      },
    },
    principlesTitle: 'Vertrauen steht nicht zum Verkauf.',
    principlesBody:
      'Zahlstatus verändert weder organische Suchreihenfolge noch Bewertungen, Besuchsnachweise oder Moderation. Unternehmensprüfung ist keine Reparaturgarantie. Ein Kontaktklick ist keine Nachricht, Buchung oder Reparatur.',
    conditions:
      'Vor kostenpflichtigen Zusatzleistungen müssen Nutzen, Preis, Leistungsumfang und Kündigung geklärt und vom Betreiber freigegeben sein. Es gibt hier keinen Aboabschluss, Checkout oder Zahlungsauftrag.',
    closingTitle: 'Passende Werkstatt finden. Selbst entscheiden.',
    closingBody:
      'Die öffentliche Suche bleibt ohne Konto zugänglich. Ein Werkstattentwurf bleibt bis zur Prüfung und Freigabe unveröffentlicht.',
    searchAction: 'Zur Werkstattsuche',
    onboardingAction: 'Werkstatt aufnehmen',
  },
  sq: {
    title: 'Monetizimi',
    subtitle: 'Një model i drejtë. Vendime të qarta.',
    description:
      'Shërbime bazë falas për klientët dhe serviset. Të ardhurat e mundshme në të ardhmen do të vijnë vetëm nga shërbime shtesë, jo nga rekomandime të blera.',
    benefits: ['Pilot falas', 'Zgjedhje e lirë e servisit', 'Pa renditje të blera'],
    currentLabel: 'Baza falas e pilotit',
    futureLabel: 'Ide për të ardhmen · ende për shqyrtim',
    pilotNotice:
      'Piloti publik nuk është miratuar ende. Kjo faqe shpjegon bazën falas dhe hapat e mundshëm të ardhshëm, jo paketa që mund të blihen.',
    cards: {
      profiles: {
        title: 'Profilet e serviseve',
        description:
          'Profili bazë është falas gjatë pilotit. Një abonim i ardhshëm Pro do të ishte opsional dhe nuk është vendosur ende.',
        points: [
          'Shërbimet, kontakti dhe vlerësimet në profilin bazë',
          'Publikim vetëm pas kontrollit të suksesshëm',
          'I gjendshëm dhe i kontaktueshëm edhe pa abonim',
        ],
        action: 'Hap regjistrimin e servisit',
      },
      tools: {
        title: 'Mjete shtesë',
        description:
          'Mjetet e mundshme Pro do të shqyrtohen vetëm pasi të provohen dobia dhe gatishmëria për të paguar. Ato ende nuk janë ofertë e disponueshme.',
        points: [
          'Analizë e synimeve të kontaktit për servisin tuaj',
          'Portofol më i gjerë fotografish dhe shërbimesh',
          'Mbështetje shumëgjuhëshe dhe administrative',
        ],
        action: 'Lexo parakushtet',
      },
      drivers: {
        title: 'Falas për shoferët',
        description:
          'Kërkimi, profilet, kontakti i zgjedhur dhe vlerësimet mbeten falas për klientët. Për vlerësimet vazhdojnë të vlejnë rregullat e hyrjes dhe të dëshmisë.',
        points: [
          'Kërko dhe krahaso servise pa llogari',
          'Zgjidh vetë WhatsApp ose telefonin',
          'Vlerëso përvojat pa tarifë platforme',
        ],
        action: 'Gjej servise',
      },
      partners: {
        title: 'Bashkëpunime të mundshme',
        description:
          'Bashkëpunimet dhe reklamat janë vetëm ide për të ardhmen. Këtu nuk paraqiten partneritete të konfirmuara ose oferta aktive reklamimi.',
        points: [
          'Bashkëpunim vetëm pas shqyrtimit dhe miratimit',
          'Reklamat të shënohen qartë si reklama',
          'Pa pozicion të privilegjuar në kërkimin organik',
        ],
        action: 'Lexo sqarimet',
      },
    },
    principlesTitle: 'Besimi nuk është në shitje.',
    principlesBody:
      'Pagesa nuk ndryshon renditjen organike, vlerësimet, dëshmitë e vizitave ose moderimin. Kontrolli i biznesit nuk është garanci për riparimin. Një klikim kontakti nuk është mesazh, rezervim ose riparim.',
    conditions:
      'Para shërbimeve shtesë me pagesë, dobia, çmimi, përmbajtja dhe anulimi duhet të sqarohen dhe të miratohen nga operatori. Këtu nuk lidhet abonim, nuk kryhet blerje dhe nuk urdhërohet pagesë.',
    closingTitle: 'Gjej servisin e përshtatshëm. Vendos vetë.',
    closingBody:
      'Kërkimi publik mbetet i hapur pa llogari. Drafti i një servisi mbetet i papublikuar deri në kontroll dhe miratim.',
    searchAction: 'Kërko servise',
    onboardingAction: 'Regjistro servisin',
  },
  en: {
    title: 'Monetization',
    subtitle: 'A fair model. Clear choices.',
    description:
      'Free essentials for drivers and garages. Possible future revenue comes only from additional services, not from purchased recommendations.',
    benefits: ['Free pilot', 'Choose your own garage', 'No paid rankings'],
    currentLabel: 'Free pilot foundation',
    futureLabel: 'Future idea · subject to evaluation',
    pilotNotice:
      'The public pilot has not been approved yet. This page explains the free foundation and possible next steps, not packages available to purchase.',
    cards: {
      profiles: {
        title: 'Garage profiles',
        description:
          'The basic profile is free during the pilot. A future Pro subscription would be optional and has not been decided on.',
        points: [
          'Services, contact details and reviews in the basic profile',
          'Publication only after a successful review',
          'Discoverable and contactable without a subscription',
        ],
        action: 'Open garage registration',
      },
      tools: {
        title: 'Additional tools',
        description:
          'Possible Pro tools will be evaluated only after usefulness and willingness to pay have been demonstrated. They are not available offers yet.',
        points: [
          'Insights into contact intentions for your own garage',
          'An extended photo and service portfolio',
          'Multilingual and administrative support',
        ],
        action: 'Read the prerequisites',
      },
      drivers: {
        title: 'Free for drivers',
        description:
          'Search, profiles, chosen contact and reviews remain free for customers. Reviews still follow the sign-in and visit-evidence requirements.',
        points: [
          'Find and compare garages without an account',
          'Choose WhatsApp or phone yourself',
          'Review your experience without a platform fee',
        ],
        action: 'Find garages',
      },
      partners: {
        title: 'Possible partnerships',
        description:
          'Partnerships and advertising are only future ideas. No confirmed partnerships or active advertising offers are presented here.',
        points: [
          'Cooperation only after evaluation and approval',
          'Clearly label advertising as advertising',
          'No preferred position in organic search',
        ],
        action: 'Read the context',
      },
    },
    principlesTitle: 'Trust is not for sale.',
    principlesBody:
      'Payment does not change organic search order, reviews, visit evidence or moderation. Business verification is not a repair guarantee. A contact click is not a message, booking or repair.',
    conditions:
      'Before any paid extras, usefulness, price, scope and cancellation terms must be clarified and approved by the operator. This page does not create a subscription, checkout or payment order.',
    closingTitle: 'Find a suitable garage. Decide for yourself.',
    closingBody:
      'Public search remains accessible without an account. A garage draft stays unpublished until review and approval.',
    searchAction: 'Search for garages',
    onboardingAction: 'Register a garage',
  },
};
