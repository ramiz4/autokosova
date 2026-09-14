import { landingCopy } from './landing-copy';
import { profileCopy } from './profile-copy';
import { searchCopy } from './search-copy';

export const APP_LANGUAGES = ['de', 'sq', 'en'] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const LANGUAGE_LABELS: Readonly<Record<AppLanguage, string>> = {
  de: 'Deutsch',
  en: 'English',
  sq: 'Shqip',
};

type MessageCatalog = Readonly<Record<string, string>>;

// These are product UI strings, not translations of garage-provided descriptions or reviews.
// User-provided content stays in its submitted language and is explicitly labelled as such.
const messages: Readonly<Record<AppLanguage, MessageCatalog>> = {
  de: {
    'a11y.language': 'Sprache auswählen',
    'analytics.change': 'Einstellung ändern',
    'analytics.description':
      'Hilf uns optional mit anonymen Nutzungsereignissen. Es werden keine Fahrzeug-, Reise- oder Freitextdaten übertragen.',
    'analytics.disable': 'Anonyme Messung ausschalten',
    'analytics.enable': 'Anonyme Messung erlauben',
    'analytics.title': 'Optionale, anonyme Nutzungsdaten',
    'common.backHome': 'Zur Startseite',
    'common.backSearch': 'Zur Suche',
    'common.cancel': 'Abbrechen',
    'common.choose': 'Bitte wählen',
    'common.error': 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
    'common.loading': 'Wird geladen …',
    'common.optional': 'optional',
    'common.retry': 'Erneut versuchen',
    'contact.call': 'Anrufen',
    'contact.choose': 'Kontakt auswählen',
    'contact.description':
      'Du wählst diesen Betrieb selbst. Ein Klick öffnet nur den sichtbaren Entwurf oder die Telefon-App. Er sendet keine Nachricht, bestätigt keinen Auftrag und reserviert keinen Termin.',
    'contact.openWhatsapp': 'In WhatsApp öffnen',
    'contact.title': 'Kontakt bewusst vorbereiten',
    'contact.unavailable':
      'Für dieses Profil ist keine gültige öffentliche Telefonnummer verfügbar. Ein externer Kontaktlink wird deshalb nicht angeboten.',
    'contact.userTextNote':
      'Nichts aus einer gespeicherten Anfrage wird automatisch übernommen. VIN, Kennzeichen, Dokumente, Upload-URLs und genaue Reisedaten gehören nicht in diesen Entwurf.',
    'home.badge': 'Werkstatt finden',
    'home.direct.body': 'Du wählst den Betrieb und den Kontaktkanal.',
    'home.direct.title': 'Direkt',
    'home.honest.body': 'Keine Sterne oder Verfügbarkeit werden erfunden.',
    'home.honest.title': 'Ehrlich',
    'home.intro':
      'Suche ohne Konto nach Leistung und Ort. Du entscheidest selbst, wen du kontaktierst – ohne Angebotsauktion, Buchung oder automatische Anfrage.',
    'home.request': 'Detaillierte Anfrage mit Fahrzeug und mehreren Orten',
    'home.search': 'Werkstatt finden',
    'home.location': 'Ort',
    'home.radius': 'Radius km',
    'home.service': 'Leistung',
    'home.searchErrorRadius': 'Der Radius muss zwischen {min} und {max} km liegen.',
    'home.searchErrorService': 'Bitte wähle zuerst eine Leistung.',
    'home.searchIntro': 'Der Radius ist eine Luftlinie in Kosovo.',
    'home.searchTitle': 'Starte deine Suche',
    'home.title': 'Finde eine passende Werkstatt in Kosovo.',
    'home.transparent.body': 'Nachvollziehbare Gründe statt bezahlter Reihenfolge.',
    'home.transparent.title': 'Transparent',
    'home.trust':
      'Unternehmensdatenprüfung ist keine Reparaturqualitätsgarantie. Kontakt, Preis und Fertigstellung vereinbarst du direkt mit der gewählten Werkstatt.',
    'home.garageOnboarding': 'Werkstatt aufnehmen',
    'profile.details': 'Leistungen und Angaben',
    'profile.language': 'Sprachen',
    'profile.localDemo': 'Lokale Demo · ausschliesslich fiktive Entwicklungsdaten',
    'profile.localDemoContact':
      'Lokale Demo: Die Vorschau und der Link sind prüfbar, aber WhatsApp oder Telefon werden nicht geöffnet.',
    'profile.loading': 'Werkstattprofil wird geladen …',
    'profile.noPhotos': 'Keine Fotos veröffentlicht.',
    'profile.noReviews': 'Noch keine Bewertungen',
    'profile.noReviewsBody':
      'Bewertungen werden erst nach einem separaten, überprüfbaren Besuchs- und Moderationsablauf ergänzt. Wir zeigen keine Beispielsterne.',
    'profile.notAvailable': 'Werkstattprofil nicht verfügbar',
    'profile.notAvailableBody':
      'Die Werkstatt ist möglicherweise nicht veröffentlicht oder die Verbindung ist gerade unterbrochen. Es wurde kein Kontakt ausgelöst.',
    'profile.originalText': 'Von der Werkstatt bereitgestellter Originaltext; nicht übersetzt.',
    'profile.photos': 'Fotos',
    'profile.profile': 'Werkstattprofil',
    'profile.reviews': 'Erfahrungen nach Besuch',
    'profile.reviewsOriginal':
      'Bewertungstexte werden im Original angezeigt und nicht als professionelle Übersetzung ausgegeben.',
    'profile.trust': 'Vertrauensinformationen',
    'profile.trustAvailable':
      '„Unternehmensdaten geprüft“ bedeutet, dass Kontakt, Ansprechperson, Unternehmensnachweis und Standort geprüft wurden. Das ist keine Garantie für Reparaturqualität oder Verfügbarkeit.',
    'profile.trustUnavailable':
      'Für dieses Profil liegt kein Kennzeichen für geprüfte Unternehmensdaten vor.',
    'profile.verified': 'Unternehmensdaten geprüft',
    'profile.allMakes': 'Alle Fahrzeugmarken',
    'profile.allServices': 'Alle Arbeiten',
    'profile.contactConsent': 'Optionale Angaben freigeben',
    'profile.contactConsentBody':
      'Ich möchte die unten selbst eingegebenen Fahrzeug- und Anliegenangaben in meinen Nachrichtenentwurf aufnehmen.',
    'profile.filterMake': 'Fahrzeugmarke filtern',
    'profile.filterReviews': 'Bewertungen filtern',
    'profile.filterService': 'Arbeit filtern',
    'profile.messageDraft': 'Dein Nachrichtenentwurf',
    'profile.ratingDescription':
      'Der Gesamtwert ist der auf eine Dezimalstelle gerundete Mittelwert aus Arbeitsqualität, Kommunikation, Preistransparenz und Termintreue. Er beruht nur auf veröffentlichten Bewertungen mit überprüftem Besuchsnachweis.',
    'profile.reviewsEmpty':
      'Für diese Auswahl gibt es noch keine veröffentlichte, belegte Erfahrung.',
    'profile.reviewsLoading': 'Bewertungen werden geladen …',
    'profile.reviewsUnavailable':
      'Bewertungen sind gerade nicht verfügbar. Das bedeutet nicht, dass es keine gibt.',
    'profile.visitProof':
      '„Besuch belegt“ bedeutet, dass ein privater Nachweis geprüft wurde. Die Rechnung, vollständige Identität und Fahrzeugdetails bleiben privat. Eine Werkstattantwort ändert oder entfernt die Bewertung nicht.',
    'request.intro':
      'Deine Angaben sind nur dein Suchkontext. Es entsteht kein öffentlicher Auftrag, keine Buchung und keine automatische Anfrage an Werkstätten.',
    'request.search': 'Passende Werkstätten suchen',
    'request.title': 'Was soll an deinem Fahrzeug gemacht werden?',
    'request.addVehicle': 'Fahrzeugdaten ergänzen',
    'request.back': 'Zurück',
    'request.next': 'Weiter',
    'request.stepProblem': 'Problem',
    'request.stepReview': 'Prüfen',
    'request.stepTravel': 'Ort und Reise',
    'request.stepVehicle': 'Fahrzeug',
    'request.vehicle': 'Fahrzeugdaten sind optional',
    'request.vehicleHelp':
      'Sie helfen später beim Filtern. Bitte gib nie VIN oder Kennzeichen ein.',
    'search.activeFilters': 'Aktive Filter',
    'search.aerialDistance': '{distance} Luftlinie zu {place}',
    'search.adjust': 'Filter anpassen',
    'search.empty': 'Keine Werkstatt im gewählten Suchkreis',
    'search.emptyBody':
      'Passe Leistung oder Ort an oder wähle bewusst einen grösseren Radius. Wir zeigen nicht automatisch weiter entfernte Betriebe.',
    'search.error': 'Ergebnisse sind gerade nicht verfügbar',
    'search.errorBody':
      'Bitte versuche es erneut oder passe deine Filter an. Es wurde keine Anfrage an eine Werkstatt gesendet.',
    'search.foundOne': 'Werkstatt gefunden',
    'search.foundMany': 'Werkstätten gefunden',
    'search.invalid': 'Suchangaben fehlen',
    'search.invalidBody':
      'Wähle bitte Leistung, Ort und Radius. Wir erweitern den Suchkreis nicht stillschweigend.',
    'search.loading': 'Suche wird geladen …',
    'search.map': 'Karte anzeigen',
    'search.mapUnavailable':
      'Die Kartenansicht ist derzeit nicht verfügbar. Die Ergebnisliste funktioniert weiterhin vollständig.',
    'search.next': 'Weiter',
    'search.previous': 'Zurück',
    'search.profile': 'Profil ansehen',
    'search.radius': '{distance} Radius um {place}',
    'search.reasonAnyMake': 'Markenoffen',
    'search.reasonLanguage': 'Sprache: {language}',
    'search.reasonService': 'Leistung: {service}',
    'search.selfReported': 'Selbstauskunft:',
    'search.title': 'Werkstätten finden',
    'search.why': 'Warum passend',
    'search.intro':
      'Der Suchkreis ist eine Luftlinie. Mehrere Orte werden zusammen berücksichtigt; eine Werkstatt erscheint nur einmal. Fahrzeug-, Reise- und Dateiangaben werden nicht an Werkstätten gesendet.',
  },
  en: {
    'a11y.language': 'Choose language',
    'analytics.change': 'Change preference',
    'analytics.description':
      'Optionally help us with anonymous usage events. No vehicle, travel, or free-text data is sent.',
    'analytics.disable': 'Disable anonymous measurement',
    'analytics.enable': 'Allow anonymous measurement',
    'analytics.title': 'Optional anonymous usage data',
    'common.backHome': 'Back to home',
    'common.backSearch': 'Back to search',
    'common.cancel': 'Cancel',
    'common.choose': 'Please choose',
    'common.error': 'Something went wrong. Please try again.',
    'common.loading': 'Loading …',
    'common.optional': 'optional',
    'common.retry': 'Try again',
    'contact.call': 'Call',
    'contact.choose': 'Choose contact',
    'contact.description':
      'You choose this garage yourself. A click only opens the visible draft or phone app. It does not send a message, confirm a job, or reserve an appointment.',
    'contact.openWhatsapp': 'Open in WhatsApp',
    'contact.title': 'Prepare contact deliberately',
    'contact.unavailable':
      'This profile has no valid public phone number, so no external contact link is offered.',
    'contact.userTextNote':
      'Your details are used only in the visible draft. Stored requests, VINs, registration numbers, documents, upload URLs, and exact travel dates remain excluded.',
    'home.badge': 'Find a garage',
    'home.direct.body': 'You choose the garage and contact channel.',
    'home.direct.title': 'Direct',
    'home.honest.body': 'No ratings or availability are invented.',
    'home.honest.title': 'Honest',
    'home.intro':
      'Search by service and place without an account. You decide whom to contact — with no bidding, booking, or automatic request.',
    'home.request': 'Detailed request with vehicle and multiple places',
    'home.search': 'Find a garage',
    'home.location': 'Location',
    'home.radius': 'Radius km',
    'home.service': 'Service',
    'home.searchErrorRadius': 'The radius must be between {min} and {max} km.',
    'home.searchErrorService': 'Please choose a service first.',
    'home.searchIntro': 'The radius is straight-line distance in Kosovo.',
    'home.searchTitle': 'Start your search',
    'home.title': 'Find a suitable garage in Kosovo.',
    'home.transparent.body': 'Clear reasons instead of paid placement.',
    'home.transparent.title': 'Transparent',
    'home.trust':
      'A company-data check is not a repair-quality guarantee. You agree contact, price, and completion directly with the garage you choose.',
    'home.garageOnboarding': 'Register a garage',
    'profile.details': 'Services and details',
    'profile.language': 'Languages',
    'profile.localDemo': 'Local demo · fictional development data only',
    'profile.localDemoContact':
      'Local demo: the preview and link can be checked, but WhatsApp or the phone app will not open.',
    'profile.loading': 'Garage profile is loading …',
    'profile.noPhotos': 'No photos published.',
    'profile.noReviews': 'No reviews yet',
    'profile.noReviewsBody':
      'Reviews appear only after a separate, verifiable visit and moderation process. We do not show sample stars.',
    'profile.notAvailable': 'Garage profile unavailable',
    'profile.notAvailableBody':
      'The garage may not be published, or the connection is interrupted. No contact was initiated.',
    'profile.originalText': 'Original text supplied by the garage; not translated.',
    'profile.photos': 'Photos',
    'profile.profile': 'Garage profile',
    'profile.reviews': 'Experiences after a visit',
    'profile.reviewsOriginal':
      'Review texts are shown in their original language and are not presented as professional translations.',
    'profile.trust': 'Trust information',
    'profile.trustAvailable':
      '“Company data checked” means contact details, contact person, company proof, and location were checked. It is not a guarantee of repair quality or availability.',
    'profile.trustUnavailable': 'There is no company-data check label for this profile.',
    'profile.verified': 'Company data checked',
    'profile.allMakes': 'All vehicle makes',
    'profile.allServices': 'All services',
    'profile.contactConsent': 'Allow optional details',
    'profile.contactConsentBody':
      'I want to add the vehicle and concern details I enter below to my message draft.',
    'profile.filterMake': 'Filter vehicle make',
    'profile.filterReviews': 'Filter reviews',
    'profile.filterService': 'Filter service',
    'profile.messageDraft': 'Your message draft',
    'profile.ratingDescription':
      'The overall score is the average of work quality, communication, price transparency, and punctuality, rounded to one decimal. It is based only on published reviews with verified visit evidence.',
    'profile.reviewsEmpty': 'There is no published, verified experience for this selection yet.',
    'profile.reviewsLoading': 'Reviews are loading …',
    'profile.reviewsUnavailable':
      'Reviews are unavailable right now. That does not mean there are none.',
    'profile.visitProof':
      '“Visit verified” means private evidence was checked. The invoice, full identity, and vehicle details remain private. A garage response does not alter or remove a review.',
    'request.intro':
      'Your details are only your search context. This creates no public job, booking, or automatic request to garages.',
    'request.search': 'Search suitable garages',
    'request.title': 'What work does your vehicle need?',
    'request.addVehicle': 'Add vehicle details',
    'request.back': 'Back',
    'request.next': 'Next',
    'request.stepProblem': 'Problem',
    'request.stepReview': 'Review',
    'request.stepTravel': 'Location and travel',
    'request.stepVehicle': 'Vehicle',
    'request.vehicle': 'Vehicle details are optional',
    'request.vehicleHelp':
      'They can help with filtering later. Never enter a VIN or registration number.',
    'search.activeFilters': 'Active filters',
    'search.aerialDistance': '{distance} straight-line distance from {place}',
    'search.adjust': 'Adjust filters',
    'search.empty': 'No garage in the selected area',
    'search.emptyBody':
      'Adjust the service or location, or deliberately choose a larger radius. We do not automatically show more distant garages.',
    'search.error': 'Results are unavailable right now',
    'search.errorBody': 'Please try again or adjust your filters. No request was sent to a garage.',
    'search.foundOne': 'garage found',
    'search.foundMany': 'garages found',
    'search.invalid': 'Search details are missing',
    'search.invalidBody':
      'Choose a service, place, and radius. We never silently broaden the search area.',
    'search.loading': 'Search is loading …',
    'search.map': 'Show map',
    'search.mapUnavailable':
      'The map is currently unavailable. The result list remains fully usable.',
    'search.next': 'Next',
    'search.previous': 'Previous',
    'search.profile': 'View profile',
    'search.radius': '{distance} radius around {place}',
    'search.reasonAnyMake': 'All makes welcome',
    'search.reasonLanguage': 'Language: {language}',
    'search.reasonService': 'Service: {service}',
    'search.selfReported': 'Self-reported:',
    'search.title': 'Find garages',
    'search.why': 'Why it matches',
    'search.intro':
      'The search radius is a straight line. Multiple locations are considered together, and each garage appears once. Vehicle, travel, and file details are never sent to garages.',
  },
  sq: {
    'a11y.language': 'Zgjidh gjuhën',
    'analytics.change': 'Ndrysho zgjedhjen',
    'analytics.description':
      'Na ndihmo në mënyrë opsionale me ngjarje anonime përdorimi. Nuk dërgohen të dhëna për automjetin, udhëtimin ose tekst i lirë.',
    'analytics.disable': 'Çaktivizo matjen anonime',
    'analytics.enable': 'Lejo matjen anonime',
    'analytics.title': 'Të dhëna anonime opsionale të përdorimit',
    'common.backHome': 'Kthehu në faqen kryesore',
    'common.backSearch': 'Kthehu te kërkimi',
    'common.cancel': 'Anulo',
    'common.choose': 'Të lutem zgjidh',
    'common.error': 'Diçka shkoi keq. Provo përsëri.',
    'common.loading': 'Po ngarkohet …',
    'common.optional': 'opsionale',
    'common.retry': 'Provo përsëri',
    'contact.call': 'Telefono',
    'contact.choose': 'Zgjidh kontaktin',
    'contact.description':
      'Ti e zgjedh vetë këtë servis. Një klikim hap vetëm draftin e dukshëm ose aplikacionin e telefonit. Nuk dërgon mesazh, nuk konfirmon porosi dhe nuk rezervon termin.',
    'contact.openWhatsapp': 'Hape në WhatsApp',
    'contact.title': 'Përgatit kontaktin me vetëdije',
    'contact.unavailable':
      'Ky profil nuk ka numër publik të vlefshëm, ndaj nuk ofrohet lidhje kontakti e jashtme.',
    'contact.userTextNote':
      'Të dhënat e tua përdoren vetëm në draftin e dukshëm. Kërkesat e ruajtura, VIN-i, targat, dokumentet, URL-të e ngarkimeve dhe datat e sakta të udhëtimit përjashtohen.',
    'home.badge': 'Gjej servis',
    'home.direct.body': 'Ti zgjedh servisin dhe kanalin e kontaktit.',
    'home.direct.title': 'Direkt',
    'home.honest.body': 'Nuk shpiken vlerësime ose disponueshmëri.',
    'home.honest.title': 'I sinqertë',
    'home.intro':
      'Kërko pa llogari sipas shërbimit dhe vendit. Ti vendos kë të kontaktosh — pa ankand ofertash, rezervim ose kërkesë automatike.',
    'home.request': 'Kërkesë e detajuar me automjet dhe disa vende',
    'home.search': 'Gjej servis',
    'home.location': 'Vendi',
    'home.radius': 'Rrezja km',
    'home.service': 'Shërbimi',
    'home.searchErrorRadius': 'Rrezja duhet të jetë nga {min} deri në {max} km.',
    'home.searchErrorService': 'Zgjidh fillimisht një shërbim.',
    'home.searchIntro': 'Rrezja është distancë ajrore në Kosovë.',
    'home.searchTitle': 'Fillo kërkimin',
    'home.title': 'Gjej një servis të përshtatshëm në Kosovë.',
    'home.transparent.body': 'Arsye të qarta në vend të renditjes me pagesë.',
    'home.transparent.title': 'Transparent',
    'home.trust':
      'Kontrolli i të dhënave të kompanisë nuk garanton cilësinë e riparimit. Kontaktin, çmimin dhe përfundimin i dakordon drejtpërdrejt me servisin që zgjedh.',
    'home.garageOnboarding': 'Regjistro servis',
    'profile.details': 'Shërbimet dhe të dhënat',
    'profile.language': 'Gjuhët',
    'profile.localDemo': 'Demo lokale · vetëm të dhëna zhvillimi fiktive',
    'profile.localDemoContact':
      'Demo lokale: pamja paraprake dhe lidhja mund të kontrollohen, por WhatsApp ose telefoni nuk hapen.',
    'profile.loading': 'Profili i servisit po ngarkohet …',
    'profile.noPhotos': 'Nuk ka foto të publikuara.',
    'profile.noReviews': 'Ende pa vlerësime',
    'profile.noReviewsBody':
      'Vlerësimet shfaqen vetëm pas një procesi të veçantë, të verifikueshëm të vizitës dhe moderimit. Nuk shfaqim yje shembull.',
    'profile.notAvailable': 'Profili i servisit nuk është i disponueshëm',
    'profile.notAvailableBody':
      'Servisi mund të mos jetë i publikuar ose lidhja është ndërprerë. Nuk është nisur kontakt.',
    'profile.originalText': 'Tekst origjinal i dhënë nga servisi; nuk është përkthyer.',
    'profile.photos': 'Fotot',
    'profile.profile': 'Profili i servisit',
    'profile.reviews': 'Përvoja pas vizitës',
    'profile.reviewsOriginal':
      'Tekstet e vlerësimeve shfaqen në gjuhën origjinale dhe nuk paraqiten si përkthime profesionale.',
    'profile.trust': 'Informacion besueshmërie',
    'profile.trustAvailable':
      '“Të dhënat e kompanisë të kontrolluara” do të thotë se janë kontrolluar kontakti, personi përgjegjës, dëshmia e kompanisë dhe vendndodhja. Kjo nuk garanton cilësinë ose disponueshmërinë.',
    'profile.trustUnavailable':
      'Nuk ka shenjë kontrolli të të dhënave të kompanisë për këtë profil.',
    'profile.verified': 'Të dhënat e kompanisë të kontrolluara',
    'profile.allMakes': 'Të gjitha markat e automjeteve',
    'profile.allServices': 'Të gjitha shërbimet',
    'profile.contactConsent': 'Lejo të dhëna opsionale',
    'profile.contactConsentBody':
      'Dua të shtoj të dhënat e automjetit dhe çështjes që shkruaj më poshtë në draftin e mesazhit.',
    'profile.filterMake': 'Filtro markën e automjetit',
    'profile.filterReviews': 'Filtro vlerësimet',
    'profile.filterService': 'Filtro shërbimin',
    'profile.messageDraft': 'Drafti yt i mesazhit',
    'profile.ratingDescription':
      'Vlera e përgjithshme është mesatarja e cilësisë së punës, komunikimit, transparencës së çmimit dhe përpikmërisë, e rrumbullakosur në një shifër dhjetore. Bazohet vetëm në vlerësime të publikuara me dëshmi të verifikuar vizite.',
    'profile.reviewsEmpty': 'Nuk ka ende përvojë të publikuar e të dëshmuar për këtë zgjedhje.',
    'profile.reviewsLoading': 'Vlerësimet po ngarkohen …',
    'profile.reviewsUnavailable':
      'Vlerësimet nuk janë të disponueshme tani. Kjo nuk do të thotë se nuk ka.',
    'profile.visitProof':
      '“Vizita e dëshmuar” do të thotë se u kontrollua një dëshmi private. Fatura, identiteti i plotë dhe të dhënat e automjetit mbeten private. Përgjigjja e servisit nuk e ndryshon ose heq vlerësimin.',
    'request.intro':
      'Të dhënat e tua janë vetëm kontekst kërkimi. Nuk krijohet porosi publike, rezervim ose kërkesë automatike për serviset.',
    'request.search': 'Kërko servise të përshtatshme',
    'request.title': 'Çfarë pune i duhet automjetit tënd?',
    'request.addVehicle': 'Shto të dhënat e automjetit',
    'request.back': 'Kthehu',
    'request.next': 'Vazhdo',
    'request.stepProblem': 'Problemi',
    'request.stepReview': 'Kontrollo',
    'request.stepTravel': 'Vendi dhe udhëtimi',
    'request.stepVehicle': 'Automjeti',
    'request.vehicle': 'Të dhënat e automjetit janë opsionale',
    'request.vehicleHelp': 'Mund të ndihmojnë më vonë në filtrim. Mos shkruaj kurrë VIN ose targa.',
    'search.activeFilters': 'Filtrat aktivë',
    'search.aerialDistance': '{distance} distancë ajrore nga {place}',
    'search.adjust': 'Ndrysho filtrat',
    'search.empty': 'Nuk ka servis në zonën e zgjedhur',
    'search.emptyBody':
      'Ndrysho shërbimin ose vendin, ose zgjidh me vetëdije rreze më të madhe. Nuk shfaqim automatikisht servise më të largëta.',
    'search.error': 'Rezultatet nuk janë të disponueshme tani',
    'search.errorBody':
      'Provo përsëri ose ndrysho filtrat. Nuk është dërguar kërkesë te asnjë servis.',
    'search.foundOne': 'servis u gjet',
    'search.foundMany': 'servise u gjetën',
    'search.invalid': 'Mungojnë të dhënat e kërkimit',
    'search.invalidBody':
      'Zgjidh shërbimin, vendin dhe rrezen. Nuk e zgjerojmë kurrë zonën e kërkimit pa njoftim.',
    'search.loading': 'Kërkimi po ngarkohet …',
    'search.map': 'Shfaq hartën',
    'search.mapUnavailable':
      'Harta nuk është e disponueshme tani. Lista e rezultateve mbetet plotësisht e përdorshme.',
    'search.next': 'Tjetra',
    'search.previous': 'Më parë',
    'search.profile': 'Shiko profilin',
    'search.radius': '{distance} rreze rreth {place}',
    'search.reasonAnyMake': 'Të gjitha markat pranohen',
    'search.reasonLanguage': 'Gjuha: {language}',
    'search.reasonService': 'Shërbimi: {service}',
    'search.selfReported': 'Vetëdeklarim:',
    'search.title': 'Gjej servise',
    'search.why': 'Pse përshtatet',
    'search.intro':
      'Rrezja e kërkimit është distancë ajrore. Disa vende merren së bashku dhe çdo servis shfaqet vetëm një herë. Të dhënat e automjetit, udhëtimit dhe skedarëve nuk dërgohen te serviset.',
  },
};

const serviceLabels: Readonly<Record<AppLanguage, Readonly<Record<string, string>>>> = {
  de: {
    'elektronik-diagnose': 'Elektronik und Diagnose',
    bremsen: 'Bremsen',
    getriebe: 'Getriebe',
    karosserie: 'Karosserie',
    klima: 'Klimaanlage',
    motor: 'Motor',
    reifen: 'Reifen',
    'service-inspektion': 'Service und Inspektion',
  },
  en: {
    'elektronik-diagnose': 'Electronics and diagnostics',
    bremsen: 'Brakes',
    getriebe: 'Transmission',
    karosserie: 'Bodywork',
    klima: 'Air conditioning',
    motor: 'Engine',
    reifen: 'Tyres',
    'service-inspektion': 'Service and inspection',
  },
  sq: {
    'elektronik-diagnose': 'Elektronikë dhe diagnostikim',
    bremsen: 'Frenat',
    getriebe: 'Transmisioni',
    karosserie: 'Karroceria',
    klima: 'Kondicioneri',
    motor: 'Motori',
    reifen: 'Gomat',
    'service-inspektion': 'Servis dhe kontroll',
  },
};

export function translate(
  language: AppLanguage,
  key: string,
  replacements: Readonly<Record<string, string | number>> = {},
): string {
  const template =
    profileCopy[language][key] ??
    searchCopy[language][key] ??
    landingCopy[language][key] ??
    messages[language][key] ??
    messages.de[key] ??
    key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(replacements[name] ?? ''));
}

export function localizedServiceLabel(language: AppLanguage, serviceId: string): string {
  return serviceLabels[language][serviceId] ?? serviceLabels.de[serviceId] ?? serviceId;
}
