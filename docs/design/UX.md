# UX-Konzept · Grundlagenphase

Status: klickbarer Konzeptprototyp, keine produktive Anwendung und keine Marktvalidierung. Die Arbeitsannahmen aus [PRODUCT_BRIEF.md](../PRODUCT_BRIEF.md) haben Vorrang. Fiktive Namen, Distanzen, Leistungen und Bilder im Prototyp sind sichtbar als Konzept gekennzeichnet.

## Zielablauf

1. Ohne Konto nach Leistung und Ort suchen.
2. Optional Fahrzeug, Problembeschreibung und Reisezeitraum ergänzen.
3. Ein Suchgebiet oder mehrere Orte mit jeweils eigenem Luftlinienradius auswählen.
4. Ergebnisse als Liste oder Kartenkonzept verstehen; keine Treffer, Lade- und Fehlerzustand klar erkennen.
5. Profil und Bewertungslage prüfen und bewusst einen Kontaktkanal auswählen.

Ein Kontaktklick bleibt eine Kontaktabsicht. Der Prototyp sendet keine Nachricht, löst keine Buchung aus und behauptet keine Verfügbarkeit.

## Vier Kernansichten

| Ansicht | Hauptaktion | Wichtige Zustände |
|---|---|---|
| Landing Page | `Werkstatt finden` | Gastzugang, Konzeptdaten, DE/SQ-Sprachumschaltung |
| Reparaturanfrage | Suche starten | Ein oder mehrere Orte/Radien, Rücknavigation, Formularfehler |
| Ergebnisse | Profil ansehen | Liste/Kartenkonzept, Laden, Fehler, keine Treffer, nicht bestätigte Verfügbarkeit |
| Werkstattprofil | Kontakt bewusst wählen | Keine Bewertungen, Kontaktwahl ohne Versand, mobile Kontaktleiste |

## Bedienung und Barrierefreiheit

- Alle Aktionen sind native Buttons oder Links und per Tastatur erreichbar; sichtbarer Fokus bleibt erhalten.
- Die Mindesthöhe interaktiver Ziele beträgt 44 px. Fehlermeldungen und Zustandswechsel sind programmatisch angekündigt.
- Inhaltliche Farbe wird nicht allein zur Unterscheidung verwendet. Text und Oberflächen haben hohen Kontrast.
- Die mobile Kontaktleiste ist sticky, nicht viewport-fixiert; der Seiteninhalt hat ausreichend unteren Abstand.
- Die Sprachumschaltung zeigt zentrale DE-/SQ-Texte. Albanische Endtexte benötigen vor Produktivsetzung ein Muttersprach-Review.

## Bewusste Abweichungen vom Showcase

Das Originalbild aus dem Startpaket liegt nicht im Repository. Der Prototyp übernimmt daher nur die dokumentierte Richtung – blau-weisse Oberfläche, dunkler automobilbezogener Einstieg, klare Suche und mobile Nutzung – und verwendet keine nachgebauten Fotos, Logos, Bewertungen oder Leistungsversprechen. Eine Kartenansicht ist absichtlich als nicht verbundene Konzeptfläche gekennzeichnet, bis Anbieter und Datenmodell in #6 entschieden sind.

## Testumfang

Die Browserprüfung umfasst den Weg Landing Page → Anfrage → Ergebnisse → Profil → Kontaktwahl, Fehler- und Leerzustände, Sprachwechsel sowie 390 px und 1280 px Breite. Es gibt keine echten Werkstätten, Kontaktwege, Kartenanbieter oder Verfügbarkeitsdaten.
