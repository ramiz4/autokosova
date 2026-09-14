# AutoKosova

**Qualitätsorientierte Werkstattsuche in Kosovo für die Diaspora.**

Passende Werkstatt anhand nachvollziehbarer Erfahrungen, Spezialisierung und Standort finden und selbst direkt kontaktieren.

## Projektstand

Privates Repository mit Produktplanung und technischer Grundlage. Der Stack ist in [ADR-001](docs/architecture/ADR-001.md) und [ADR-002](docs/architecture/ADR-002.md) festgelegt; Marke, Domain und Anbieterbestellungen sind weiterhin nicht freigegeben.

- [Produktbrief und MVP](docs/PRODUCT_BRIEF.md)
- [Monetarisierung](docs/MONETIZATION.md)
- [Epics und Umsetzungsreihenfolge](docs/BACKLOG.md)
- [Arbeitsregeln für Entwickler und AI Agents](AGENTS.md)
- [Designrichtung und Präzisierungen](docs/design/README.md)
- [ZITADEL-Integration und offenes Login-Gate](docs/architecture/AUTH-INTEGRATION.md)
- [Werkstattaufnahme, Prüfung und Bildschutz](docs/architecture/WORKSHOP-ONBOARDING.md)
- [Öffentliche Mehrortsuche und nachvollziehbares Matching](docs/architecture/SEARCH-MATCHING.md)
- [Bewusster Direktkontakt über WhatsApp oder Telefon](docs/architecture/DIRECT-CONTACT.md)
- [Bewertungen und private Besuchsnachweise](docs/architecture/REVIEWS.md)
- [Moderation, Meldungen und Datenlebenszyklus](docs/architecture/MODERATION-LIFECYCLE.md)
- [DE/SQ/EN, SEO und datensparsame Messung](docs/MEASUREMENT.md)

## Entwicklungsstart

Voraussetzung: eine von Angular 22 unterstützte Node.js-Laufzeit (Node 22.22.3+, 24.15+
oder 26+) sowie Docker mit lokalem Linux-Docker-Kontext und Docker Compose v2. `.nvmrc`
legt Node 24.21.0 für CI und reproduzierbare Fehlersuche nahe; lokale Entwicklungs- und
Diagnosebefehle erzwingen diese Version nicht.
Auf ARM-Macs nutzt der PostGIS-Container die `linux/amd64`-Emulation von Docker.

```sh
npm ci
npm run dev:demo
```

Eine `.env`-Datei und ein manueller `DATABASE_URL`-Export sind dafür nicht erforderlich.
Der Starter prüft die lokale Umgebung, startet die eigene Worktree-DB, führt ausstehende
Migrationen und den gewählten Seed aus und startet Angular. Erst eine erfolgreiche
Such-API-Abfrage mit DB-Zugriff meldet die App als bereit. Angular läuft standardmäßig auf `http://localhost:4200/`; die tatsächliche URL steht
in der Ausgabe. Der separat gebaute SSR-Server (`npm run start:ssr`) verwendet `PORT`,
standardmäßig 4000. `PORT` steuert nicht den Angular-Entwicklungsserver. Ctrl+C beendet die App samt Kindprozessen; DB und Daten bleiben erhalten.

| Befehl                       | Datenprofil / Wirkung                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                | Referenzkatalog: Kategorien, Marken und Orte                                                                    |
| `npm run dev:demo`           | Zusätzlich 25 öffentliche fiktive Demo-Werkstätten                                                              |
| `npm run dev:demo-workflows` | Zusätzlich gekennzeichnete Bewertungen, private Testanfragen und Nachweis-Metadaten                             |
| `npm run dev:doctor`         | Nur Diagnose von Toolchain, Konfiguration, Docker, Ressourcen und Ports; kein Start und keine DB-/Dateiänderung |

Die Demo-Befehle setzen die erforderlichen Seed-Freigaben nur im Seed-Prozess. Ein
Profilwechsel entfernt keine vorhandenen Daten. Demo-Profile beginnen mit `DEMO ·`;
der öffentliche Demo-Seed enthält keine Bewertungen oder privaten Nachweise.
Die Kontaktvorschau bleibt testbar, öffnet bei Demo-Profilen aber weder WhatsApp
noch die Telefon-App. Workflowdaten erzeugen keinen Login-Bypass.

### Konfiguration und getrennte Worktrees

Die Reihenfolge ist: eingebaute Starter-Defaults → `.env` → `.env.local` → bereits
vorhandene Prozessvariablen. Leere Portwerte verwenden die Defaults. Produktionsprozesse
laden keine lokalen Dateien. Derselbe Loader wird von Starter, DB-Skripten und Server
verwendet; die abgeleitete DB-Konfiguration reicht der Starter an seine Kindprozesse weiter.

Der kanonische Worktree-Pfad bestimmt einen stabilen Compose-Projektnamen, eigene
DB-Volumes und einen Standardport für die DB. Angular bleibt standardmäßig auf 4200.
Für parallel laufende Worktrees in deren jeweiliger `.env.local` ausdrücklich
`AUTOKOSOVA_APP_PORT=4201`, `4202` usw. setzen. `AUTOKOSOVA_DB_PORT` ist ebenfalls
konfigurierbar. Bei einer Portkollision einen freien Port wählen;
App und DB müssen unterschiedliche Ports haben. Die DB bleibt `autokosova` innerhalb
ihres eigenen Containers und bindet am Host ausschließlich an `127.0.0.1`.

Ein alter `DATABASE_URL`-Export muss mit dem gewählten Worktree-Port übereinstimmen,
sonst stoppt der Starter vor Migrationen. Meist genügt `unset DATABASE_URL` und das
Entfernen eines alten Werts aus der lokalen Datei. Fremde DB-Ziele, Produktionsmodus,
Docker-Host-/TLS-Overrides und nichtlokale Docker-Kontexte sind im Starter gesperrt.
Container, Volume, Worktree-Label und veröffentlichter Port werden vor DB-Schreibzugriffen geprüft.

Login bleibt optional für öffentliche Suche und Profile. Für private Abläufe die
vollständige freigegebene ZITADEL-Konfiguration gemäß untenstehender Dokumentation
bereitstellen. `AUTOKOSOVA_APP_PORT` muss zum bereits freigegebenen Callback
`http://localhost:<Port>/auth/callback` passen. Der Starter ändert keine OIDC-Anbieterkonfiguration.
Eine unvollständige lokale OIDC-Konfiguration wird für den Starter deaktiviert und als
fehlender Login ausgegeben; die bestehende Authentifizierung wird nicht umgangen.

### Fehlerbehebung

`npm run dev:doctor` nennt die betroffene Voraussetzung und den nächsten Schritt.
Bei fehlendem Docker zuerst Docker Desktop/Engine starten; bei Portkonflikten die
oben genannten Portwerte prüfen. Bei Migrations- oder Seed-Fehlern hält der Ablauf an,
bevor Angular startet. Der entsprechende `db:`-Befehl kann anschließend gezielt mit
der geprüften lokalen DB-Adresse ausgeführt werden. Es gibt keinen automatischen Reset.

Ein zweiter Starter im selben Worktree wird abgewiesen. Nach einem harten Prozessabbruch
bleibt gegebenenfalls `.autokosova-dev.lock/owner` mit der ursprünglichen PID zurück.
Zuerst diese PID und zugehörige App-Prozesse prüfen und beenden. Erst wenn keine eigenen
Starter-/App-Prozesse mehr laufen, ausschließlich `owner` und das dann leere Sperrverzeichnis
entfernen. Der Starter übernimmt oder löscht eine verwaiste Sperre nie automatisch.

### Bestehende lokale Daten und manueller Einstieg

Der neue Starter übernimmt vorhandene ältere Compose-Volumes nicht automatisch und
verschiebt oder löscht sie nicht. Sie bleiben mit dem bisherigen Compose-Projekt und
Port über den manuellen Ablauf erreichbar. `npm start` bleibt der direkte Angular-Start
für eine bereits vorbereitete Umgebung; er startet weder DB noch Seeds.

```sh
docker compose up -d --wait db
export DATABASE_URL=postgresql://autokosova:autokosova@127.0.0.1:55432/autokosova
npm run db:migrate
npm run db:seed
AUTOKOSOVA_DEMO_DATA=1 npm run db:seed:demo
npm start
```

Bei älteren Worktrees den bisherigen Compose-Projektnamen beibehalten. Ein absichtlicher
Portwechsel eines bereits vorhandenen Starter-Containers wird wegen der abweichenden
Zuordnung zunächst abgewiesen: App beenden und ausschließlich den eigenen DB-Container
mit dem ausgegebenen Projekt über `docker compose -p <Projekt> stop db` und
`docker compose -p <Projekt> rm db` entfernen. Das Volume erhalten, danach mit dem neuen
Port starten. Keine anderen Projekte oder Volumes entfernen.

Die eigenständigen Seed-/Reset-Befehle behalten ihre bisherigen Freigaben und verlangen
eine explizite lokale `DATABASE_URL`; sie wählen nicht automatisch einen Worktree aus.
Docker-Start und Migrationen allein erzeugen keine Demo-Daten.

### Installationsskripte und Prüfung des Einstiegs

`allowScripts` in `package.json` und `strict-allow-scripts=true` in `.npmrc` machen neue,
ungeprüfte Installationsskripte zum Fehler. Vor Updates mit `npm install-scripts ls`
prüfen; keine pauschale Freigabe verwenden. Die Entscheidungen stehen in
[docs/development/INSTALL-SCRIPTS.md](docs/development/INSTALL-SCRIPTS.md).

```sh
npm run test:dev
npm run test:dev:smoke
npm run test:dev:smoke:full
```

`test:dev:smoke` startet schnell einen isolierten Demo-Ablauf mit den bereits installierten
Abhängigkeiten, prüft Ctrl+C und entfernt seinen temporären Worktree wieder. Für den
vollständigen Nachweis führt `test:dev:smoke:full` zwei frische Worktrees mit eigenen
PostGIS-DBs, Abhängigkeitsinstallationen, Wiederholung, Isolation und Fehlerfällen aus.
CI verwendet ausschließlich diesen vollständigen Test mit fiktiven Daten.

## Lokale Test-OIDC-Konten

Die fiktiven Konten für Kunde, Werkstattmitglied, Moderator und Admin liegen mit ihren Passwörtern
und aktuellen Subjects ausschließlich im freigegebenen 1Password-Store. Die instanzspezifische lokale Konfiguration
für ZITADEL wird daraus gezielt in Prozessvariablen oder eine ignorierte `.env.local`
übernommen. Der Starter liest 1Password nicht automatisch; weder `.env.example` noch Git, CI oder Logs enthalten
Zugangsdaten. Der Server übernimmt `admin` und `moderator` ausschließlich aus dem verifizierten
ZITADEL-Projektrollen-Claim. Details und die Workshop-Membership-Grenze stehen in
[AUTH-INTEGRATION.md](docs/architecture/AUTH-INTEGRATION.md).

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:server
npm run build
npm run test:smoke
ALLOW_LOCAL_RESET=1 npm run db:reset
ALLOW_LOCAL_RESET=1 AUTOKOSOVA_DEMO_DATA=1 npm run db:reset:demo
ALLOW_LOCAL_RESET=1 AUTOKOSOVA_DEMO_DATA=1 AUTOKOSOVA_DEMO_WORKFLOW_DATA=1 npm run db:reset:demo-workflows
```

`db:reset` ist absichtlich ohne `ALLOW_LOCAL_RESET=1` gesperrt und darf niemals mit `NODE_ENV=production` laufen. Alle Reset-Befehle akzeptieren nur die lokale Datenbank `autokosova`; `db:reset:demo` verlangt zusätzlich `AUTOKOSOVA_DEMO_DATA=1`, und `db:reset:demo-workflows` verlangt beide Demo-Freigaben. Ein Reset mit oder ohne Demo-Daten ist die einzige vorgesehene Bereinigung der Demo-Daten; die Seed-Befehle löschen keine anderen lokalen Daten.
Falls Port 55432 belegt ist, kann vor `docker compose up` ein anderer lokaler Port mit `AUTOKOSOVA_DB_PORT=55433` gesetzt werden; `DATABASE_URL` muss dann denselben Port verwenden.

## Produktregeln

Qualität vor Billigpreis. Kein Bietermodell. Suche, Profile und Direktkontakt ohne Konto. Ein Ort mit Radius oder mehrere Orte mit jeweils eigenem Radius. Unternehmensprüfung ist keine Reparaturgarantie. Bewertungen und organisches Ranking sind nicht käuflich.

## Reparaturanfrage lokal prüfen

`/inquiry` führt in fünf Schritten durch Fahrzeug, Reparatur, Ort & Zeit, Details und Zusammenfassung.
Alle Fahrzeugfelder sind einzeln optional; Fahrzeugklasse und Kraftstoff verwenden begrenzte Auswahllisten.
Modell und Motorisierung bleiben Freitext; Getriebe verwendet eine optionale Auswahl. Die Anfrage enthält Leistung/Symptom sowie einen bis drei
Orte mit 5–100 km Luftlinienradius. Als lokale Kalendertage werden nur früheste Abgabe und späteste Abholung erfasst; Abgabe darf nicht nach Abholung liegen. Gäste behalten den Entwurf nur im
Browser und können damit zur Suche weitergehen. Nur nach OIDC-Anmeldung kann die Anfrage über die
private API dauerhaft gespeichert werden. Die Zusammenfassung zeigt den bestätigten Speicherstatus;
Speicherfehler behalten den Browserentwurf. Der Suchübergang enthält ausschließlich Leistung und
Orts-/Radiusfilter; es wird nichts automatisch an Werkstätten gesendet. Fotos und Diagnoseberichte
bleiben optional und privat; ohne einen konfigurierten Objektspeicher werden sie in der lokalen
Entwicklungsoberfläche nicht hochgeladen.

## Öffentliche Suche lokal prüfen

`/garages` zeigt ohne Filter alle veröffentlichten Werkstattprofile. `/garages?places=xk-pristina%3A20&service=bremsen` verwendet nur veröffentlichte Werkstattprofile,
den gepflegten Leistungsfilter und Ortskreise als Luftlinie. Mehrere Orte werden mit Komma getrennt,
zum Beispiel `places=xk-pristina:20,xk-prizren:30`. Optional sind `vehicleMake=skoda` und
`language=Deutsch`. Suchanfragen enthalten keine privaten Anfragewerte. Ohne Kartenanbieter bleibt
die Ergebnisliste mit Entfernung zum passenden Suchort funktionsfähig.

## Direktkontakt lokal prüfen

Ein veröffentlichtes Profil unter `/garages/<id>` zeigt nur freigegebene Profildaten sowie den
ehrlichen Bewertungsleerzustand. WhatsApp und Telefon sind bewusst ausgewählte externe Aktionen:
Die Nachrichtenvorschau ist vor dem Öffnen sichtbar, enthält keine gespeicherten privaten
Anfragewerte und wird nicht durch AutoKosova gesendet. Ohne gültige öffentliche Telefonnummer gibt
es keinen externen Link.

## Sprache, SEO und Messung lokal prüfen

`/`, `/sq` und `/en` führen durch dieselben Kernabläufe; der Sprachwechsel bewahrt dabei Pfad
und unkritische Suchparameter. Nutzertexte und Bewertungen bleiben unverändert im Original. Der
Schalter für die anonyme, aggregierte Messung ist standardmäßig aus. Details zu den zulässigen vier
Ereignissen, der Auswertung, SEO-Grenzen und der weiterhin erforderlichen Sprachprüfung stehen in
[MEASUREMENT.md](docs/MEASUREMENT.md).

## Bewertungen lokal prüfen

Eine Bewertung wird ausschließlich über die angemeldete private API mit einem zuvor autorisierten
privaten Upload eingereicht. Der Nachweis bleibt getrennt von der öffentlichen Bewertung und wird
für den lokalen Ablauf einem Moderator zugewiesen. Erst nach der dokumentierten Prüfliste erscheint
eine Erfahrung im Profil und in der Suche. Der genaue Ablauf, öffentliche Felder und die
Aufbewahrungsgrenze stehen in [REVIEWS.md](docs/architecture/REVIEWS.md). Lokale Tests verwenden
keine echten Rechnungen, Fahrzeuge oder Werkstätten.

## Entwicklung

Ausschliesslich GitHub Issues und Pull Requests; kein Jira und keine doppelte Ticketpflege. Die Build- und Testcommands sind oben dokumentiert. Keine Infrastruktur wurde bestellt oder produktiv eingerichtet. GitHub Actions nutzt eine flüchtige PostGIS-Testdatenbank und erhält keine Secrets.

## Lizenz

Noch keine Open-Source-Lizenz festgelegt. Veröffentlichung oder Lizenzierung erfordert eine Betreiberentscheidung.

## URL-Konvention

Kanonische Pfade bleiben in allen UI-Sprachen Englisch: `/inquiry`, `/garages`, `/garages/new` und `/garages/:garageId`, jeweils optional mit `/sq` oder `/en`. Alte deutsche UI-Pfade leiten weiter. Werkstatt-API-Pfade verwenden ebenfalls `garages`; Collection-Antworten verwenden den Schlüssel `garages`.
