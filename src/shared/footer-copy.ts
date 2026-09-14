import type { AppLanguage } from './i18n';

const de = {
  navigation: 'Footer-Navigation',
  customers: 'Für Kunden',
  garages: 'Für Garagen',
  about: 'Über AutoKosova',
  find: 'Garagen finden',
  inquiry: 'Anfrage erstellen',
  register: 'Garage eintragen',
  follow: 'Folge uns',
  noProfiles: 'Offizielle Social-Media-Profile sind noch nicht bestätigt.',
  newTab: 'öffnet in einem neuen Tab',
  legal: 'Rechtliches',
  rights: 'Alle Rechte vorbehalten.',
  provisional: 'Vorläufige Seite',
  pending: 'Die Inhalte dieser Seite sind noch nicht freigegeben.',
  legalPending:
    'Dies ist kein gültiger Rechtstext. Die rechtliche und inhaltliche Freigabe steht noch aus.',
  back: 'Zur Startseite',
  helpTitle: 'Hilfe & Kontakt',
  helpBody:
    'Hilfetexte und ein bestätigter Support-Kontakt fehlen noch. Diese Seite sendet keine Nachricht und nimmt keinen Kontakt auf.',
  partnersTitle: 'Partner werden',
  partnersBody:
    'Informationen zu einer Partnerschaft und deren Voraussetzungen sind noch nicht freigegeben. Hier wird keine Partnerschaft abgeschlossen.',
  benefitsTitle: 'Vorteile für Garagen',
  benefitsBody:
    'Die Beschreibung der Vorteile für Garagen wird noch vorbereitet. Es werden keine Leistungen, Preise oder Ergebnisse zugesichert.',
  missionTitle: 'Unsere Mission',
  missionBody: 'Eine freigegebene Beschreibung der Mission von AutoKosova liegt noch nicht vor.',
  careersTitle: 'Karriere',
  careersBody:
    'Es liegen noch keine bestätigten Stellenangebote oder Bewerbungswege vor. Diese Seite nimmt keine Bewerbungen entgegen.',
  blogTitle: 'Blog',
  blogBody: 'Es sind noch keine redaktionellen Beiträge freigegeben.',
  privacyTitle: 'Datenschutz',
  privacyBody:
    'Eine freigegebene Datenschutzerklärung fehlt. Verantwortliche Stelle, Verarbeitungszwecke, Rechtsgrundlagen, Empfänger, Speicherfristen und Betroffenenrechte müssen bestätigt werden.',
  termsTitle: 'AGB',
  termsBody:
    'Freigegebene Geschäftsbedingungen fehlen. Vertragspartner, Leistungsumfang und anwendbare Bedingungen müssen rechtlich geprüft werden. Diese Seite begründet keine Vereinbarung.',
  imprintTitle: 'Impressum',
  imprintBody:
    'Die bestätigte Betreiberidentität, Geschäftsanschrift, Kontaktangaben und gegebenenfalls erforderliche Registerangaben fehlen. Sie werden nicht durch Beispieldaten ersetzt.',
};

export type FooterCopyKey = keyof typeof de;

export const footerCopy: Readonly<Record<AppLanguage, Readonly<Record<FooterCopyKey, string>>>> = {
  de,
  sq: {
    navigation: 'Navigimi në fund të faqes',
    customers: 'Për klientët',
    garages: 'Për serviset',
    about: 'Rreth AutoKosova',
    find: 'Gjej servise',
    inquiry: 'Krijo një kërkesë',
    register: 'Regjistro servisin',
    follow: 'Na ndiq',
    noProfiles: 'Profilet zyrtare në rrjetet sociale ende nuk janë konfirmuar.',
    newTab: 'hapet në një skedë të re',
    legal: 'Informacione ligjore',
    rights: 'Të gjitha të drejtat e rezervuara.',
    provisional: 'Faqe e përkohshme',
    pending: 'Përmbajtja e kësaj faqeje ende nuk është miratuar.',
    legalPending:
      'Ky nuk është një tekst ligjor i vlefshëm. Miratimi ligjor dhe ai i përmbajtjes ende mungojnë.',
    back: 'Kthehu në faqen kryesore',
    helpTitle: 'Ndihmë & kontakt',
    helpBody:
      'Tekstet e ndihmës dhe një kontakt i konfirmuar për mbështetje ende mungojnë. Kjo faqe nuk dërgon mesazhe dhe nuk kontakton askënd.',
    partnersTitle: 'Bëhu partner',
    partnersBody:
      'Informacionet për partneritetin dhe kushtet e tij ende nuk janë miratuar. Këtu nuk lidhet asnjë partneritet.',
    benefitsTitle: 'Përfitimet për serviset',
    benefitsBody:
      'Përshkrimi i përfitimeve për serviset është ende në përgatitje. Nuk garantohen shërbime, çmime apo rezultate.',
    missionTitle: 'Misioni ynë',
    missionBody: 'Ende nuk ka një përshkrim të miratuar të misionit të AutoKosova.',
    careersTitle: 'Karriera',
    careersBody:
      'Ende nuk ka vende pune ose mënyra aplikimi të konfirmuara. Kjo faqe nuk pranon aplikime.',
    blogTitle: 'Blogu',
    blogBody: 'Ende nuk është miratuar asnjë artikull për botim.',
    privacyTitle: 'Privatësia',
    privacyBody:
      'Mungon një deklaratë e miratuar e privatësisë. Duhet të konfirmohen kontrolluesi i të dhënave, qëllimet, bazat ligjore, marrësit, afatet e ruajtjes dhe të drejtat e personave.',
    termsTitle: 'Kushtet e përgjithshme',
    termsBody:
      'Mungojnë kushtet e përgjithshme të miratuara. Palët kontraktuese, shërbimet dhe kushtet e zbatueshme duhet të shqyrtohen ligjërisht. Kjo faqe nuk krijon marrëveshje.',
    imprintTitle: 'Të dhënat ligjore',
    imprintBody:
      'Mungojnë identiteti i konfirmuar i operatorit, adresa e biznesit, të dhënat e kontaktit dhe të dhënat e nevojshme të regjistrimit. Ato nuk zëvendësohen me të dhëna shembull.',
  },
  en: {
    navigation: 'Footer navigation',
    customers: 'For customers',
    garages: 'For garages',
    about: 'About AutoKosova',
    find: 'Find garages',
    inquiry: 'Create an inquiry',
    register: 'Register a garage',
    follow: 'Follow us',
    noProfiles: 'Official social media profiles have not been confirmed yet.',
    newTab: 'opens in a new tab',
    legal: 'Legal information',
    rights: 'All rights reserved.',
    provisional: 'Provisional page',
    pending: 'The content of this page has not been approved yet.',
    legalPending:
      'This is not a valid legal document. Legal and content approval are still pending.',
    back: 'Back to home',
    helpTitle: 'Help & contact',
    helpBody:
      'Help content and a confirmed support contact are still missing. This page does not send messages or contact anyone.',
    partnersTitle: 'Become a partner',
    partnersBody:
      'Partnership information and requirements have not been approved yet. No partnership is entered into here.',
    benefitsTitle: 'Benefits for garages',
    benefitsBody:
      'The description of benefits for garages is still being prepared. No services, prices or outcomes are promised.',
    missionTitle: 'Our mission',
    missionBody: 'An approved description of the AutoKosova mission is not available yet.',
    careersTitle: 'Careers',
    careersBody:
      'No job openings or application channels have been confirmed yet. This page does not accept applications.',
    blogTitle: 'Blog',
    blogBody: 'No editorial articles have been approved for publication yet.',
    privacyTitle: 'Privacy',
    privacyBody:
      'An approved privacy notice is missing. The data controller, purposes, legal bases, recipients, retention periods and data subject rights must be confirmed.',
    termsTitle: 'Terms',
    termsBody:
      'Approved terms are missing. The contracting parties, services and applicable conditions require legal review. This page does not create an agreement.',
    imprintTitle: 'Legal notice',
    imprintBody:
      'The confirmed operator identity, business address, contact details and any required registration details are missing. They are not replaced with sample data.',
  },
};
