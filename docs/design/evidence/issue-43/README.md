# Reparaturanfrage: lokaler Vergleich für #43

Vergleich vom 14.09.2026 mit [Screenshot 2](../../references/2026-09-13/mockups/02-reparaturanfrage.png).
Alle eingegebenen Fahrzeug-/Reisedaten sind fiktive DEMO-Daten. Aufnahmen stammen vom eigenen lokalen Worktree, ohne öffentliche Bereitstellung.

| Ansicht | Nachweis |
| --- | --- |
| Fahrzeug, Desktop 1448 × 1086 | [DE, fiktive Eingaben](vehicle-demo-1448.webp), [SQ](sq-1448.webp), [EN](en-1448.webp) |
| Fahrzeug, Desktop 1280 | [DE](de-1280.webp) |
| Fahrzeug, Mobil | [DE 360](de-360.webp), [DE 390](de-390.webp), [DE 430](de-430.webp), [SQ 360](sq-360.webp), [EN 360](en-360.webp) |
| Reparatur | [Desktop](step-2.webp) |
| Ort & Zeit | [Desktop](travel-1448.webp), [Mobil](travel-360.webp) |
| Details ohne Upload-Anbindung | [Mobil](details-430.webp) |
| Zusammenfassung / Browserentwurf | [Desktop](summary-1448.webp), [Mobil](summary-360.webp) |

Die Bilder zeigen die gesamte scrollbare Seite; die Viewporthöhe betrug 1086 px.
Fahrzeugschritt in DE/SQ/EN bei 1448, 1280, 360, 390 und 430 px geprüft. Zusätzlich Reise- und Zusammenfassungsschritt bei allen fünf Breiten geprüft; keine horizontalen Überläufe. Der Gastdurchlauf durch alle fünf Schritte und die anschließende Suche funktionierten im Browser. Ein realer nicht angemeldeter Speicheraufruf zeigte den Login-Hinweis und ließ die Suche weiterhin zu. Die Such-URL enthielt ausschließlich `places` und `service`.

## Bewusste Unterschiede zur Vorlage

- Vorhandenes optimiertes Bergstraßenmotiv und gemeinsamer Header; vorhandene Navigation bleibt bestehen. Kompakte Headerdarstellung nur auf der Anfrageseite.
- Keine Beispielperson, Sterne, Angebotsversprechen oder automatische Weitergabe. Freie Seitenfläche statt erfundenem Testimonial.
- Alle Fahrzeugfelder einzeln optional, anfangs leer. Klasse lässt sich durch erneutes Anklicken abwählen. Modell und Motorisierung bleiben Freitext; Getriebe verwendet eine optionale Auswahl.
- Mindestens 44 px hohe Eingaben und Bedienflächen. Mobil stapeln sich Felder und Karten.
- Fünfter Schritt zeigt Zusammenfassung und tatsächlichen Speicherstatus. Dateien bleiben ohne Speicheranbindung lokal und werden ausdrücklich nicht mitgespeichert.

## Prüfungen und Grenzen

- `npm ci`, `npm run dev:demo`: eigene lokale PostgreSQL-DB, Migration 017 und öffentliche Demo-Daten erfolgreich.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: erfolgreich.
- `npm test -- --watch=false`: 34 Tests erfolgreich, einschließlich 12 Anfrage-Tests und 6 Routentests.
- `npm run test:server` mit der eigenen lokalen `DATABASE_URL`: 57 bestanden, 2 profilspezifische Demo-Seed-Tests übersprungen (keine entsprechenden Testprofil-Flags). Persistenz mit neuen Feldern, Teilfahrzeug und Fremdzugriff tatsächlich gegen PostgreSQL geprüft.
- `npm run build`, `npm run test:smoke`: erfolgreich. Buildwarnung: initiales Bundle rund 533 kB gegenüber 500 kB Warnschwelle; Fehlerschwelle unverändert.
- Screenreader-Semantik (`aria-current`, Status-/Fehlermeldungen), Fokuswechsel und Eingabevalidierung automatisiert geprüft. Kein manueller Durchlauf mit einem Screenreader und keine native mobile Browserprüfung.
- Echter OIDC-Login mit Testkonto nicht ausgeführt: dieser isolierte Worktree hat keine OIDC-Konfiguration. Private Speicherung und Berechtigungen wurden über die authentifizierte API in Tests geprüft; dies ersetzt den realen OIDC-Durchlauf nicht.

Pointer-Cursor zentral für aktive Links, Buttons, Auswahllisten, aufklappbare Elemente und Auswahl-/Upload-Bedienelemente ergänzt. Im Browser auf Header, Fahrzeugklassen, Auswahllisten und Formularaktionen über die berechneten CSS-Werte geprüft. Deaktivierte Elemente sind ausgenommen.

## Kanonische englische Routen

Der Assistent liegt unter `/inquiry`; Profile und Aufnahme unter `/garages/:garageId` und `/garages/new`. Alle drei Sprachen verwenden dieselben englischen Pfadsegmente. Alte deutsche UI-Pfade sind ausschließlich Weiterleitungen. API-Pfade verwenden `/api/garages`, `/api/public/garages`, `/api/me/garages` und `/api/admin/garages`; Collection-Antworten heißen `garages`. Die früheren API-Pfade werden nicht weiter angeboten. Die API-Berechtigungsmatrix wurde unter den neuen Pfaden erneut geprüft. Ein öffentliches Demo-Profil wurde über die neue UI-/API-Route im Browser erfolgreich geladen.

Sitemap und Robots-Regeln berücksichtigen die neuen Pfade: Suchlisten und Aufnahme bleiben ausgeschlossen, öffentliche Profilpfade werden nicht durch eine zu breite `/garages`-Regel gesperrt. Login-Rücksprünge akzeptieren nur den kanonischen Anfragepfad bzw. bekannte deutsche Vorgänger, die direkt auf `/inquiry` normalisiert werden.

Die Anfrageseite hat eine sticky Navigation: im Mobilbrowser nach 800 px Scrollen bleibt die Kopfzeile bei 0–64 px sichtbar. [Scrollnachweis](sticky-mobile.webp). Getriebe ist eine optionale Auswahl; ältere Freitexte bleiben als bisheriger Wert erhalten.

## Mobile Schrittanzeige und gemeinsame Navigation

Auf schmalen Displays zeigt die Schrittleiste fünf nummerierte Indikatoren und die vollständige Bezeichnung des aktuellen Schritts in einer eigenen Zeile. Alle fünf Beschriftungen bleiben für Screenreader verfügbar. [Mobile Schrittanzeige](mobile-steps.webp).

Im ersten Schritt stehen Abbrechen und Weiter nebeneinander: bei 360 px jeweils 130,5 × 52 px. In Folgeschritten stehen Zurück und Weiter in derselben Zeile, Abbrechen darunter; die lange Suchaktion erhält im Abschluss eine volle Zeile. [Mobile Aktionen](mobile-actions.webp).

Neue Anfrage und Werkstätten finden haben auf ihrer jeweiligen Seite einen blauen 3-px-Unterstrich sowie `aria-current="page"`, auch im mobilen Menü. Die Suche verwendet denselben kompakten sticky Header wie die Anfrage. Nach 800 px Scrollen bleibt er auf beiden Seiten bei 0–64 px: [Suche Desktop](garages-sticky-1448.webp), [Suche Mobil](garages-sticky-390.webp). DE/SQ/EN wurden erneut in allen fünf Vergleichsbreiten ohne horizontalen Überlauf geprüft.
