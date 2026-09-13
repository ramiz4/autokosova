# Backlog · Einstieg

**GitHub Issues sind die einzige laufende Ticketquelle.** Dieses Dokument ist ein Wegweiser, keine zweite Status-, Schätzungs- oder Ticketliste. Keine JSON-/Markdown-Kopien manuell synchronisieren.

## Epics

| Phase | Epic | Initialer Umfang am 13.09.2026 |
|---|---|---|
| 1 | [#1 Produkt, UX und technische Grundlage](https://github.com/ramiz4/autokosova/issues/1) | 5 Arbeitspakete, vorläufig 21 SP |
| 2 | [#2 Passende Werkstatt finden und direkt kontaktieren](https://github.com/ramiz4/autokosova/issues/2) | 5 Arbeitspakete, vorläufig 26 SP |
| 3 | [#3 Glaubwürdige Bewertungen und kontrollierter Pilot](https://github.com/ramiz4/autokosova/issues/3) | 5 Arbeitspakete, vorläufig 26 SP |

Initial: 15 Arbeitspakete plus 3 Epic-Übersichtsissues, vorläufig 73 SP. Epics werden nicht zusätzlich geschätzt. Massgeblich für spätere Änderungen sind die Live-Issues, nicht dieser initiale Überblick.

## Umsetzungsreihenfolge

Mit [#4 Produkt/Monetarisierung](https://github.com/ramiz4/autokosova/issues/4) beginnen. Danach [#5 UX](https://github.com/ramiz4/autokosova/issues/5) und [#6 Architektur](https://github.com/ramiz4/autokosova/issues/6); Entwürfe dürfen mit gekennzeichneten Annahmen parallel zu externen Gesprächen vorbereitet werden. Die Architektur muss vor Implementierung genehmigt sein.

Jedes Epic enthält seine geordnete Kinderliste. Jedes Arbeitspaket nennt die direkten Abhängigkeiten, Tests und externen Freigaben. Unabhängige Arbeit darf bei erfüllten Voraussetzungen parallel stattfinden. Offene Interviews/Freigaben nicht als erledigt darstellen.

## Filter

Labels: `type:epic`, `type:discovery`, `type:feature`; `priority:P0`, `priority:P1`; `phase:foundation`, `phase:discovery`, `phase:trust`; `sp:3`, `sp:5`, `sp:8`; `needs:human-input`.

P0 kennzeichnet Grundlagen oder zwingende Voraussetzungen vor Pilot, nicht allein die Ausführungsreihenfolge. Diese folgt den Abhängigkeiten.

## Abbildung in GitHub

Epics sind normale Issues mit Label und verlinkten Checklisten. Abhängigkeiten sind direkte Issue-Verweise im Text, keine serverseitig erzwungenen Blockierungen. Native Sub-Issue-Beziehungen, GitHub Projects und Milestones sind bei diesem Setup nicht eingerichtet. Kein Jira und keine zweite Ticketverwaltung.
