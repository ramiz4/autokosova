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
- `npm test -- --watch=false`: 42 Tests erfolgreich, einschließlich 12 Anfrage-Tests und 6 Routentests.
- `npm run test:server` mit der eigenen lokalen `DATABASE_URL`: 60 bestanden, 2 profilspezifische Demo-Seed-Tests übersprungen (keine entsprechenden Testprofil-Flags). Persistenz mit neuen Feldern, Teilfahrzeug und Fremdzugriff tatsächlich gegen PostgreSQL geprüft.
- `npm run build`, `npm run test:smoke`: erfolgreich. Buildwarnung: initiales Bundle rund 548 kB gegenüber 500 kB Warnschwelle; Fehlerschwelle unverändert.
- Screenreader-Semantik (`aria-current`, Status-/Fehlermeldungen), Fokuswechsel und Eingabevalidierung automatisiert geprüft. Kein manueller Durchlauf mit einem Screenreader und keine native mobile Browserprüfung.
- Echter Customer-OIDC-Login auf Port 4200 erfolgreich: Favorit per Herz gespeichert, API-Eintrag bestätigt, nach Neuladen erhalten, wieder entfernt und abgemeldet. PostgreSQL- und API-Tests prüfen zusätzlich Besitzer-Isolation, Export und Löschung.

Pointer-Cursor zentral für aktive Links, Buttons, Auswahllisten, aufklappbare Elemente und Auswahl-/Upload-Bedienelemente ergänzt. Im Browser auf Header, Fahrzeugklassen, Auswahllisten und Formularaktionen über die berechneten CSS-Werte geprüft. Deaktivierte Elemente sind ausgenommen.

## Kanonische englische Routen

Der Assistent liegt unter `/inquiry`; Profile und Aufnahme unter `/garages/:garageId` und `/garages/new`. Alle drei Sprachen verwenden dieselben englischen Pfadsegmente. Alte deutsche UI-Pfade sind ausschließlich Weiterleitungen. API-Pfade verwenden `/api/garages`, `/api/public/garages`, `/api/me/garages` und `/api/admin/garages`; Collection-Antworten heißen `garages`. Die früheren API-Pfade werden nicht weiter angeboten. Die API-Berechtigungsmatrix wurde unter den neuen Pfaden erneut geprüft. Ein öffentliches Demo-Profil wurde über die neue UI-/API-Route im Browser erfolgreich geladen.

Sitemap und Robots-Regeln berücksichtigen die neuen Pfade: Suchlisten und Aufnahme bleiben ausgeschlossen, öffentliche Profilpfade werden nicht durch eine zu breite `/garages`-Regel gesperrt. Login-Rücksprünge akzeptieren den kanonischen Anfragepfad, bekannte deutsche Vorgänger (normalisiert auf `/inquiry`) und `/garages` mit validierten öffentlichen Suchfiltern.

Die Anfrageseite hat eine sticky Navigation: im Mobilbrowser nach 800 px Scrollen bleibt die Kopfzeile bei 0–64 px sichtbar. [Scrollnachweis](sticky-mobile.webp). Getriebe ist eine optionale Auswahl; ältere Freitexte bleiben als bisheriger Wert erhalten.

## Mobile Schrittanzeige und gemeinsame Navigation

Auf schmalen Displays zeigt die Schrittleiste fünf nummerierte Indikatoren und die vollständige Bezeichnung des aktuellen Schritts in einer eigenen Zeile. Alle fünf Beschriftungen bleiben für Screenreader verfügbar. [Mobile Schrittanzeige](mobile-steps.webp).

Im ersten Schritt stehen Abbrechen und Weiter nebeneinander: bei 360 px jeweils 130,5 × 52 px. In Folgeschritten stehen Zurück und Weiter in derselben Zeile, Abbrechen darunter; die lange Suchaktion erhält im Abschluss eine volle Zeile. [Mobile Aktionen](mobile-actions.webp).

Neue Anfrage und Werkstätten finden haben auf ihrer jeweiligen Seite einen blauen 3-px-Unterstrich sowie `aria-current="page"`, auch im mobilen Menü. Die Suche verwendet denselben kompakten sticky Header wie die Anfrage. Nach 800 px Scrollen bleibt er auf beiden Seiten bei 0–64 px: [Suche Desktop](garages-sticky-1448.webp), [Suche Mobil](garages-sticky-390.webp). DE/SQ/EN wurden erneut in allen fünf Vergleichsbreiten ohne horizontalen Überlauf geprüft.

## Vereinfachte Reisedaten

Die Anfrage erfasst nur früheste Abgabe und späteste Abholung. Aufenthaltsende wurde aus Formular, Zusammenfassung, Übersetzungen, API-Vertrag, Speicherung und privaten Datenexporten entfernt. Bestehende Browserentwürfe werden mit dem aktuellen Formularvertrag neu gespeichert, sodass das veraltete Feld entfällt. Browserprüfung: genau zwei Datumsfelder, Zusammenfassung erreichbar und kein veraltetes Feld im Browserentwurf.

Migration 018 entfernt die Spalte samt bisherigen Werten und ersetzt die Datumsbedingung durch `Abgabe ≤ Abholung`. Auf der eigenen lokalen DB blieben alle neun vor der Migration vorhandenen Anfragen erhalten; die Spalte ist nicht mehr vorhanden. Die vollständigen UI-/Server-/PostgreSQL-Prüfungen wurden anschließend erfolgreich wiederholt. Historische Migration 011 bleibt als angewendete Versionshistorie unverändert.

## Schwebendes Menü und Glasoberflächen

Das mobile Menü liegt absolut unter dem Header und verändert den Seitenfluss nicht. Auf Anfrage und Suche bleibt der Hero beim Öffnen bei y=64 px, die Headerhöhe bei 64 px; das Menü liegt zwischen y=72 und y=398 px (390 × 844). [Anfrage mit geöffnetem Menü](inquiry-glass-menu.webp), [Suche mit geöffnetem Menü](garages-glass-menu.webp).

Menü und sticky Navbar nutzen getrennte, leicht transparente Glasflächen mit Backdrop-Blur und Sättigung. Eine eigene Hintergrundebene der Navbar verhindert, dass ihre Unschärfe die Glasschicht des Menüs begrenzt. [Anfrage beim Scrollen](inquiry-glass-scroll.webp), [Suche beim Scrollen](garages-glass-scroll.webp). Bei reduzierter Transparenz oder fehlender Blur-Unterstützung bleiben die Flächen undurchsichtig.

Escape, Menülinks und Tippen außerhalb schließen das Menü. Die Außenaktion ist automatisiert geprüft. Bei nur 390 px Viewporthöhe bleiben alle Menüpunkte durch internes Scrollen erreichbar: Anfrage, Suche und Startseite bei 360, 430 und 1024 px Breite geprüft; kein horizontaler Überlauf und Menüunterkante innerhalb des Viewports.

## Gemeinsamer Radius-Regler und Suchfilter

Startseite, Anfrage und Suche verwenden denselben formularfähigen Radius-Regler: 4-px-Spur, weißer 20-px-Griff mit 2-px-blauem Rand, 14-px-Beschriftungen und Grenzen von 5 bis 100 km. Die native Bedienfläche bleibt 44 px hoch. [Startseite](radius-home.webp), [Anfrage](radius-inquiry.webp), [Suche](radius-search.webp). Pfeiltasten, Home/End, Formwert-Synchronisierung, Touched-/Disabled-Zustand und Rücknavigation sind geprüft.

Die Suchfilter haben eine flache Gestaltung ohne verschachtelte Karten. Standorte erscheinen als aufklappbare Zeilen mit Ort und Radius; ein neuer Ort öffnet sich direkt und klappt die anderen zu. Doppelte Ortsauswahlen werden verhindert, jeder Radius bleibt unabhängig. Leistung ist ein eindeutiges Auswahlfeld entsprechend der unterstützten Einzelauswahl. Alle Feldlabels sind einheitlich 14 px groß. [Desktop](filter-desktop.webp), [Mobil eingeklappt](filter-mobile-collapsed.webp), [Mobil geöffnet](filter-mobile-open.webp).

Mobil ist der gesamte Filter aufklappbar. Ergebnisse bleiben während einer Aktualisierung erhalten und werden als beschäftigt markiert. Änderungen der URL-Filter laden die Treffer neu; ältere verspätete Antworten können neuere Ergebnisse nicht überschreiben. Anwenden änderte im lokalen Browsernachweis die Trefferzahl von 6 auf 25. Zurücksetzen lädt alle Ergebnisse und setzt die Eingaben zurück. DE/SQ/EN bei 360/430 px ohne horizontale Überläufe und mit einheitlicher Labelgröße geprüft.

## Unternehmensprüfung in Ergebniskarten

Der zusätzliche Chip „Unternehmensdaten geprüft“ entfällt. Die Prüfung erscheint ausschließlich als blaues, sternförmiges Badge mit weißem Haken neben dem Werkstattnamen. Tooltip und Screenreader-Name benennen weiterhin präzise die Unternehmensdatenprüfung. Ohne bestätigten `companyDataVerified`-Wert wird das Icon nicht angezeigt. Diese Grenze und die Entfernung des doppelten Chips sind im UI-Test geprüft. [Ergebniskarte](verification-badge.webp).

## Ergebnisfokus, optionale Orte und Favoriten

Die Suche beginnt direkt mit Filter und Ergebnissen. Bild-Hero, Hero-Suchfeld, Vorteilsblöcke und sichtbare Seitenüberschrift entfallen nach der letzten Nutzerentscheidung. Die semantische H1 bleibt für Screenreader erhalten. [Desktop](search-results-1448.webp), [Mobil 390](search-results-390.webp), [Mobil 360](search-results-360.webp).

Ohne gesetzten Ortsfilter bleibt die Ortsauswahl leer: „Ganz Kosovo“ und „Ort und Radius sind optional“. Marke, Leistung und Sprache gelten auch für die globale Suche. Die Reihenfolge ist Marke, Leistung, Sprache. Der Filter bleibt nach dem Scrollen bei y=80 unter der 64 px hohen Navbar, bei Bedarf mit internem Scrollbereich.

Migration 019 speichert private Favoriten im Konto. Angemeldete Navbar: [Desktop](account-navbar.webp), [Mobil](account-mobile.webp). [Bestätigter Favorit und fiktive Demo-Bewertung](favorite-card.webp). Sechs veröffentlichte fiktive Workflow-Bewertungen auf drei ausdrücklich als DEMO bezeichneten Profilen zeigen echte berechnete Mittelwerte und Anzahlen. `npm run test:demo-workflow-seed` wurde separat mit eigener lokaler DB erfolgreich ausgeführt.

Die finale Suche wurde in DE/SQ/EN bei 1920, 1448, 390 und 360 px ohne horizontalen Überlauf geprüft. Keine öffentliche Bereitstellung; keine echten Kundendaten in den Nachweisen.

Navbar-Inhalt und Suchinhalt teilen exakt dieselben Außenkanten: bei allen vier Breiten und in allen drei Sprachen wurden links und rechts 0 px Abweichung gemessen. [Großer Desktop](search-results-1920.webp).

## Kompakte Favoriten-Hinweise

Toasts sind maximal 576 px breit und unten mittig positioniert. Status-Icon, 14-px-Text und Schließen-Button bilden eine gemeinsame Zeile; der Gast-Hinweis enthält einen Anmelden-Button. Mobile Seitenabstände und Safe Area bleiben berücksichtigt. Fehler werden als Alert angekündigt, andere Hinweise als Status.

[Echter Gast-Hinweis Desktop](toast-login-1448.webp), [Mobil 360](toast-login-360.webp). Die Zustände [Gespeichert](toast-saved-fixture.webp), [Entfernt](toast-removed-fixture.webp) und [Fehler](toast-error-fixture.webp) wurden für diese reine Darstellungsprüfung mit simulierten API-Antworten aufgenommen; der echte OIDC-/Persistenznachweis ist separat oben dokumentiert. Schließen und Anmelden-Link sind bedienbar, keine horizontalen Überläufe.
