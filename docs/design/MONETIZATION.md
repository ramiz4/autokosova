# Monetarisierungsseite

Umsetzungsvorschlag zu Issue #46. Fachliche Grundlage: `docs/MONETIZATION.md`,
`docs/PRODUCT_BRIEF.md` sowie die Präzisierungen in #46. Kein öffentlicher Launch.

## Aufbau

- Kanonisch `/monetization`, `/sq/monetization` und `/en/monetization`.
  Die in der älteren Beschreibung genannten `/monetarisierung`-Pfade leiten
  entsprechend `AGENTS.md` lediglich auf die englischen Pfade weiter.
- Gemeinsamer `SiteHeaderComponent` mit tatsächlichem Kontozustand und Sprachwahl.
  Die vorhandenen Bergstraßen-WebPs und das Original-Logo werden wiederverwendet.
- Vier farblich getrennte Karten: kostenloses Werkstatt-Basisprofil, mögliche
  Zusatzwerkzeuge, kostenlose Kundennutzung und mögliche Kooperationen.
  Unter 768 px einspaltig, darüber zwei Spalten; keine feste Seitenhöhe.
- Eigene kleine, vollständig strukturierte DE/SQ/EN-Textquelle. Auswahl der Sprache,
  Linkerzeugung und Metadaten erfolgen über den bestehenden `LanguageService`.
- Aktuelle Pilotgrundlage und Zukunftsideen sind auch textlich unterschieden.
  Keine Preise, Partnerlogos, erfundenen Kennzahlen, Checkouts oder Datenerfassung.
  Aktionen führen nur zur vorhandenen Suche, Werkstattaufnahme oder zum echten
  Abschnitt über Voraussetzungen und nicht käufliches Vertrauen.

## Noch erforderliche Abnahme

Der Vorschlag folgt den textlichen Gestaltungsanforderungen des Issues. Ein
visueller Vergleich mit Screenshot 5 und Browser-Vergleichsbilder sind noch offen.
Die neutralen Kategorie-Piktogramme ersetzen Partnerlogos; Illustrationstreue,
Bildausschnitt, Kontrast, Tastaturbedienung und Layout müssen am laufenden Angular
geprüft werden. Dies ist kein behaupteter pixelgenauer Nachbau der Bildvorlage.

Prüfbreiten: 1448 × 1086 und 1280 px Desktop sowie 360, 390 und 430 px mobil,
jeweils DE/SQ/EN. Muttersprachliche SQ-Abnahme bleibt erforderlich.

Neue Verhaltenstests stehen in `monetization.component.spec.ts` und
`monetization.routes.spec.ts`. Sie prüfen Texte, vier Karten, Statuskennzeichnung,
vorhandene Ziele, Informationsanker, Sprachwechsel, Metadaten und Weiterleitungen.
Die Strukturprüfung einer Grid-Klasse ersetzt keine responsive Browserabnahme.

Die vollständigen Repository-Befehle sind vor Freigabe tatsächlich auszuführen:
`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run test:server`, `npm run build` und `npm run test:smoke`.
Ergebnisse und konkrete Umgebungsgrenzen stehen im zugehörigen PR; das Vorhandensein
von Tests ist kein Nachweis eines erfolgreichen Testlaufs.
