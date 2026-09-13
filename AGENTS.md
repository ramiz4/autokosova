# AutoKosova · Arbeitsregeln

## Quelle der Wahrheit

Ausschliesslich GitHub Issues und Pull Requests in `ramiz4/autokosova`. Keine Jira-Tickets erzeugen, importieren oder synchronisieren. Das Startpaket war ein einmaliger Import: keine JSON-/Markdown-Ticketkopien manuell synchronisieren. Laufender Umfang, Status, Schätzung und Abhängigkeiten stehen in GitHub Issues; Epics sind Übersichtsissues mit verlinkten Checklisten.

## Ein Issue ausführen

1. Zugewiesenes Issue, zugehöriges Epic, direkte Abhängigkeiten und relevante Produkt-/Architekturentscheidungen lesen. Kein repo-weites Einlesen ohne Notwendigkeit.
2. Externe Entscheidungen erkennen. Interviews, Budget-, Anbieter- und rechtliche Freigaben nicht erfinden. Bei fehlender Eingabe unabhängig mögliche Arbeit erledigen und konkreten Blocker dokumentieren. Prototyp-/ADR-Vorbereitung mit klar bezeichneten Annahmen ist nicht gleich abgeschlossene Validierung.
3. In eigenem Branch/isoliertem Worktree arbeiten. Kleine zusammenhängende Änderungen, keine parallelen Änderungen im selben Worktree.
4. Tests für Verhalten, Berechtigungen und Seiteneffekte ergänzen. Tatsächliche Commands nach Bootstrap aus README/CI übernehmen; vor Auswahl des Stacks keine erfundenen Commands angeben.
5. Änderung vor PR auf Korrektheit, Sicherheit, unnötige Komplexität und fehlende Tests prüfen. PR mit `Closes #<issue>` und tatsächlichen Prüfergebnissen erstellen.
6. Implementierungsissue erst nach erfüllter Abnahme und tatsächlich gemergter Änderung schliessen. Discovery-/Pilotissues benötigen zusätzlich reale Ergebnisse und ausdrücklich verlangte Freigaben. Merge nur im Rahmen des konkreten Nutzerauftrags und geltender Repositoryregeln; keine Checks/Freigaben umgehen.

## Ein Epic ausführen

Epic und unmittelbare Kinder lesen; nach dokumentierten Abhängigkeiten jeweils das nächste ausführbare Issue bearbeiten. Unabhängige Arbeit darf parallel in getrennten Worktrees erfolgen. Bei externen Blockern nicht fiktiv abschliessen; genaue Eingabe nennen. Epic erst nach erfüllten Kinder-Abnahmen und abschliessender Ergebnisprüfung schliessen. Keine Jira-Synchronisierung.

## Architektur und Produkt

Erst genehmigte ADR umsetzen, nicht mehrere Stacks parallel. Kleine wartbare Module, wenige Betriebsbausteine. Gäste dürfen suchen und selbst Kontakt auswählen. Kein Bietermodell und keine automatische Verteilung von Anfragen.

Reparaturqualität, Unternehmensprüfung und belegter Werkstattbesuch sind unterschiedliche Aussagen. Bezahlstatus steuert weder organische Reihenfolge noch Moderation. Mockup-Daten sind fiktiv und dürfen nicht zu produktiven Testimonials werden. Kontaktklick ist keine gesendete Nachricht, Buchung oder Reparatur.

## Datenschutz und Sicherheit

Serverseitige Objektberechtigungen. Private Belege, Fahrzeugdaten und Reisezeiten nicht veröffentlichen oder loggen. Secrets nur über freigegebene Secret-Verwaltung; keine Tokens in Issues/PRs. Kein Scraping personenbezogener Daten oder Versenden von Nachrichten ohne Auftrag. Keine kostenpflichtigen Buchungen oder öffentlichen Deployments ohne Freigabe.

## Definition of Done

Akzeptanzkriterien erfüllt; passende Tests tatsächlich ausgeführt; Fehler-/Leerzustände behandelt; mobile Oberfläche und DE/SQ-Texte berücksichtigt; Datenschutz/Berechtigungen geprüft; relevante Dokumentation aktualisiert; PR/CI überprüfbar. Nicht ausgeführte Prüfungen ausdrücklich benennen. Story Points sind vorläufige relative Grössen, keine Stunden- oder Lieferzusagen.

## Tatsächliche Entwicklungscommands

Node.js gemäß der dokumentierten Angular-22-Kompatibilität verwenden; `.nvmrc` enthält die CI-Referenz Node 24.21.0. Nach `npm ci` startet `npm run dev:demo` die eigene lokale Worktree-DB, Migrationen, öffentliche Demo-Daten und Angular. `npm run dev` verwendet nur den Referenz-Seed; `npm run dev:demo-workflows` ergänzt fiktive private Workflowdaten. `npm run dev:doctor` prüft ausschließlich lesend. Ports und Konfigurationspriorität stehen in README; vorhandene DB-Volumes werden nicht automatisch übernommen oder gelöscht. `npm start` bleibt der direkte Angular-Start ohne DB-Vorbereitung.

Prüfungen: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:dev`, `npm test`, `npm run test:server`, `npm run build`, `npm run test:smoke`. `npm run test:dev:smoke` prüft zwei neue temporäre Worktrees mit echten lokalen DBs; ausschließlich dessen eigene Prozesse werden gestoppt, Daten/Volumes bleiben erhalten. Die manuellen `db:`-Befehle benötigen weiterhin eine explizite lokale `DATABASE_URL`. Ein Reset benötigt ausdrücklich `ALLOW_LOCAL_RESET=1 npm run db:reset`; er ist bei `NODE_ENV=production` gesperrt. Keine Secrets, Kunden- oder echten Werkstattdaten in lokale Seeds, CI oder Preview-Umgebungen geben.
