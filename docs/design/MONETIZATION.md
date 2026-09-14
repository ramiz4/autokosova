# Kosten & Fairness · aktuelle kostenlose Phase

Issue #46 / PR #63. Fachliche Grundlage bleiben `docs/MONETIZATION.md`,
`docs/PRODUCT_BRIEF.md` und `docs/validation/INTERVIEWS.md`.

## Korrektur vom 14. September 2026

Der Betreiber hat das Monetarisierungs-Mockup ausdrücklich als veraltet verworfen.
Die anschließende Abschlussanweisung wird mit der besprochenen Kosten-/Fairness-
Korrektur umgesetzt, nicht mit dem zuvor abgelehnten Vier-Säulen-Entwurf.
Screenshot 5 und die ersten Screenshots von Head `8890662` sind historische
Entwürfe, keine gültigen Inhalts- oder visuellen Abnahmevorgaben mehr.

Die Anwendung beschreibt ausschließlich die aktuelle kostenlose Phase:
Kundennutzung, kostenloses Werkstatt-Basisprofil und nicht käufliche Suche,
Bewertungen, Nachweise, Unternehmensprüfung und Moderation. Plattformgebühren
und direkt mit der Werkstatt vereinbarte Reparaturkosten bleiben unterschieden.
Private Entwürfe, gesonderte Einreichung und Freigabe sind getrennte Schritte.
Der öffentliche Pilot wird nicht als bereits gestartet dargestellt.

Die Pro-, Werbe- und Kooperationskarten sowie ihre Angebotsaktionen entfallen.
Kein neuer Tarif, kein dauerhaftes Kostenfrei-Versprechen und keine Ankündigung
oder endgültige Absage späterer Abonnements. Preis- und Pro-Hypothesen bleiben
in der internen Produktdokumentation; das Geschäftsmodell wird nicht geändert.

## Oberfläche und Integration

- Sichtbarer Titel: „Kosten & Fairness“, mit vollständiger SQ-/EN-Fassung.
- Die bereits eingeführten englischen Pfade `/monetization`, `/sq/monetization`
  und `/en/monetization` bleiben stabil. Die deutschen Aliase leiten weiter.
- Gemeinsamer Header mit tatsächlichem Kontozustand, vorhandene Buttons/Icons,
  Bergstraßen-WebPs und der aktuelle gemeinsame Footer einschließlich der
  standardmäßig ausgeschalteten optionalen Messung werden wiederverwendet.
- Zwei sachliche Zielgruppenabschnitte statt vier farbiger Angebotssäulen;
  ein separater Fairnessabschnitt. Nur echte Links zu Suche und Werkstattaufnahme.
- Einspaltig auf Mobilgeräten, zwei Zielgruppenspalten ab 768 px, ohne feste Höhe.
  Texte können umbrechen; Skip-Link, Fokus und mindestens 44 px hohe Aktionen.
- Der vorhandene Sprachwechsel-Fix mit `markForCheck()` bleibt erhalten.

## Prüfung und Abschluss

Komponenten- und Routingtests prüfen die kostenlose Phase, das Fehlen der
verworfenen Angebotskarten, die Trennung von Reparaturkosten/Plattformgebühren,
Entwurf/Einreichung/Freigabe, echte lokalisierte Ziele, Sprachwechsel und Metadaten.
Header-/Footer-Integration und freiwillige Messung bleiben ebenfalls prüfbar.
Eine Grid-Klassenprüfung ist ausdrücklich kein Browsernachweis.

Vor Merge sind die reguläre CI und neue Browsernachweise für den korrigierten
Head zu prüfen: DE/SQ/EN bei 1448/1280 und 360/390/430 px, geladene Bilder,
kein horizontaler Überlauf, Tastatur und funktionierende Aktionen. Ergebnisse,
Quell-Commit und Screenshot-Artefakt stehen im PR. Ältere grüne Läufe und Bilder
belegen nicht diesen korrigierten Stand. Keine Tests umgehen oder abschwächen.
Eine unabhängige muttersprachliche SQ-Prüfung bleibt vor öffentlicher Freigabe
notwendig. Ein Merge in das private Repository ist kein öffentlicher Pilotstart.
