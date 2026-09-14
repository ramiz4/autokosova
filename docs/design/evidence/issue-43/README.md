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
- Alle Fahrzeugfelder einzeln optional, anfangs leer. Klasse lässt sich durch erneutes Anklicken abwählen. Modell, Motorisierung und Getriebe bleiben Freitext.
- Mindestens 44 px hohe Eingaben und Bedienflächen. Mobil stapeln sich Felder und Karten.
- Fünfter Schritt zeigt Zusammenfassung und tatsächlichen Speicherstatus. Dateien bleiben ohne Speicheranbindung lokal und werden ausdrücklich nicht mitgespeichert.

## Prüfungen und Grenzen

- `npm ci`, `npm run dev:demo`: eigene lokale PostgreSQL-DB, Migration 017 und öffentliche Demo-Daten erfolgreich.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: erfolgreich.
- `npm test -- --watch=false`: 25 Tests erfolgreich, einschließlich 11 Anfrage-Tests.
- `npm run test:server` mit der eigenen lokalen `DATABASE_URL`: 56 bestanden, 2 profilspezifische Demo-Seed-Tests übersprungen (keine entsprechenden Testprofil-Flags). Persistenz mit neuen Feldern, Teilfahrzeug und Fremdzugriff tatsächlich gegen PostgreSQL geprüft.
- `npm run build`, `npm run test:smoke`: erfolgreich. Buildwarnung: initiales Bundle 529,24 kB gegenüber 500 kB Warnschwelle; Fehlerschwelle unverändert.
- Screenreader-Semantik (`aria-current`, Status-/Fehlermeldungen), Fokuswechsel und Eingabevalidierung automatisiert geprüft. Kein manueller Durchlauf mit einem Screenreader und keine native mobile Browserprüfung.
- Echter OIDC-Login mit Testkonto nicht ausgeführt: dieser isolierte Worktree hat keine OIDC-Konfiguration. Private Speicherung und Berechtigungen wurden über die authentifizierte API in Tests geprüft; dies ersetzt den realen OIDC-Durchlauf nicht.
