# Startseite und gemeinsame UI-Bausteine

Umsetzung von [Issue #42](https://github.com/ramiz4/autokosova/issues/42) auf Grundlage des [Startseiten-Mockups](references/2026-09-13/mockups/01-startseite.png).

## Aufbau und Wiederverwendung

Die Startseite bietet einen Bild-Hero, einen gemeinsamen Header, eine Vorteilsleiste sowie die vorhandene Gast-Suche. Die Navigation führt zu echten Abschnitten „So funktioniert’s“ und „Über uns“ oder zur bestehenden Werkstattaufnahme. Die Hauptaktion öffnet die private Reparaturanfrage; die öffentliche Suche bleibt ohne Konto nutzbar.

| Baustein                     | Verwendung                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `SiteHeaderComponent`        | Logo, responsive Navigation, Kontoaktionen und kompakte Sprachauswahl; Abschnittslinks funktionieren auch von anderen Routen aus. |
| `ButtonDirective`            | Native Links/Buttons mit `appButton`, optional `appButton="outline"`, `shape="pill"` und `size="compact"`.                        |
| `BenefitCardComponent`       | Kleine Icon-/Textkarte für die Vorteilsleiste.                                                                                    |
| `IconComponent`              | Dekorative SVG-Symbole, einschließlich des per Flex ausgerichteten Sprachpfeils.                                                  |
| `src/tailwind.css`           | Gemeinsame Farben und Schriftfamilie als Tailwind-Tokens.                                                                         |
| `src/shared/landing-copy.ts` | DE/SQ/EN-Texte für Startseite und Header; Werkstatttexte bleiben unberührt.                                                       |

Die Konto-Buttons sind 44 px hoch und verwenden 14-px-Text. Logo, Navigationslinks, Sprachtext/-pfeil und Buttons sind vertikal zentriert. Auf Wunsch des Nutzers erhält der Hero mehr unteren Freiraum und mit `min-h-dvh` mindestens die dynamische Viewport-Höhe. Bei kleinen Displays oder größerer Schrift darf er mit dem Inhalt wachsen. Mobil ordnen sich Vorteile und Suchfelder untereinander an.

## Bildmaterial

Das [Bergstraßen-Original](references/2026-09-13/images/01-hero-bergstrasse.png) bleibt unverändert im Designarchiv. Zwei WebP-Ableitungen unter `public/images/home/` verwenden 800 bzw. 1672 px Breite und Qualität 85; sie sind etwa 100 bzw. 299 kB groß. Die mobile Variante erhält einen weiter rechts liegenden Bildausschnitt. Das Hero-Bild ist dekorativ und hat hohe Ladepriorität; Text und Bedienelemente sind HTML.

Aus `public/branding/autokosova-logo-header.png` wurden auf Nutzerwunsch ausschließlich 27 vollständig transparente untere Zeilen entfernt: 640 × 149 → 640 × 122 px. Die verbleibenden RGBA-Pixel sind identisch. Header und Footer verwenden die tatsächlichen Abmessungen; ein CSS-Crop oder vertikaler Ausgleich ist nicht erforderlich.

HTML und nicht versionierte Dateien werden mit `public, max-age=0, must-revalidate` ausgeliefert. Angular-Bundles mit Inhaltshash behalten ihre lange Cachezeit. So bleiben geänderte Seiten und Logos nach erneuter Validierung sichtbar. Bereits vor der Korrektur langfristig gespeicherte Antworten benötigen einmal eine Aktualisierung ohne Cache; die Browserabnahme wurde entsprechend neu geladen.

## Fachliche Abweichungen von der Vorlage

- Der Vertrauensbereich erklärt die persönliche Werkstatt-/Kontaktwahl; erfundene Porträts und Nutzerzahlen entfallen.
- Unternehmensprüfung und belegte Erfahrungen werden erläutert, ohne Reparaturqualität oder Terminverfügbarkeit zu garantieren.
- Login und Registrierung sind direkte Links auf den vorhandenen OIDC-Einstieg. Die Registrierung ergänzt ausschließlich `prompt=create`, damit ZITADEL direkt seine Registrierungsansicht zeigt. PKCE, State und der begrenzte lokale Rücksprungpfad bleiben erhalten. Es gibt keine zusätzliche Verfügbarkeitsprüfung oder Hinweismeldung im Header. Grundlage: [ZITADEL-Registrierungsdokumentation](https://zitadel.com/docs/guides/integrate/onboarding/end-users).
- Die optionale anonyme Messung bleibt standardmäßig aus und ist im Footer ein- und ausschaltbar.
- Der größere Abstand zur Vorteilsleiste, kleinere Konto-Buttons und die zentrierte Sprachauswahl berücksichtigen die anschließenden Designkorrekturen des Nutzers.

## Prüfung

Lokale Grundlage: Node.js 24, `npm ci`, isolierte lokale PostGIS-Datenbank auf Port 55442, Migration und Referenz-Seed. Keine echten Werkstatt-/Kundendaten, kein öffentlicher Deploy.

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test -- --watch=false`, `npm run test:server`, `npm run build` und `npm run test:smoke` ausführen; Ergebnisse und aktuelle CI im PR festhalten.
- Verhaltenstests prüfen Gast-Suchübergang, Fehler-/Radiusvalidierung, Menüzustand, Escape/Fokusrückgabe, lokalisierte Ziele, vollständige Sprachtexte, freiwillige Messung und direkte lokalisierte OIDC-Ziele und den Registrierungs-Prompt. Der Cache-Test prüft Revalidierung geänderter Bildinhalte und lange Cachezeit für versionierte Bundles.
- Browserprüfung bei 1448/1280 px Desktop und 360/390/430 px mobil: keine horizontalen Überläufe; zentrierter Header, Bedienbarkeit, Bildausschnitt und lesbare Inhalte. DE/SQ und der vorhandene EN-Einstieg sind berücksichtigt.
- Gast-Suche mit Bremsen, Prizren und 30 km bis zum ehrlichen Leerzustand; Anfrage-Einstieg und Sprachwechsel im Browser prüfen. Vergleichsbilder stehen im PR.

Die Browserabnahme verwendet die bereits konfigurierte lokale Test-OIDC-Anbindung. Die tatsächliche Weiterleitung zur Login- und Registrierungsansicht wird im PR belegt; neue Konten oder externe Anbieteränderungen gehören nicht zum Umbau. Eine muttersprachliche Abnahme der SQ-Texte bleibt offen.
