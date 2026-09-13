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

Voraussetzung: Node.js 24 LTS, Docker und Docker Compose. Die Datenbank enthält ausschließlich fiktive lokale Daten.
Auf ARM-Macs nutzt der offizielle PostGIS-Container die von Docker bereitgestellte `linux/amd64`-Emulation.

```sh
npm ci
docker compose up -d --wait db
export DATABASE_URL=postgresql://autokosova:autokosova@127.0.0.1:55432/autokosova
npm run db:migrate
npm run db:seed
npm start
```

`db:seed` lädt nur den wiederholbaren Referenzkatalog mit Kategorien, Marken und GeoNames-Orten.
Für die öffentliche Suche und Profilansicht stehen zusätzlich klar gekennzeichnete, vollständig
fiktive Demo-Werkstätten bereit:

```sh
AUTOKOSOVA_DEMO_DATA=1 npm run db:seed:demo
npm start
```

Der Demo-Seed akzeptiert nur eine lokale Loopback-URL für die Datenbank `autokosova`; er verweigert
Produktion und jede andere Datenbank. Docker-Start und Migrationen erzeugen nie Demo-Daten. Die
Demo-Profile beginnen mit `DEMO ·`, enthalten keine Bewertungen oder privaten Nachweise und öffnen
in der lokalen Oberfläche weder WhatsApp noch die Telefon-App. Die Kontaktvorschau und validierten
Links bleiben sichtbar und testbar.

Die App ist im Entwicklungsmodus über Angular erreichbar. Nach einem Produktionsbuild prüft `npm run test:smoke` die SSR-Startseite und `GET /health`.

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
```

`db:reset` ist absichtlich ohne `ALLOW_LOCAL_RESET=1` gesperrt und darf niemals mit `NODE_ENV=production` laufen. Beide Reset-Befehle akzeptieren nur die lokale Datenbank `autokosova`; `db:reset:demo` verlangt zusätzlich `AUTOKOSOVA_DEMO_DATA=1`. Ein Reset mit oder ohne Demo-Daten ist die einzige vorgesehene Bereinigung der Demo-Daten; `db:seed:demo` löscht keine anderen lokalen Daten.
Falls Port 55432 belegt ist, kann vor `docker compose up` ein anderer lokaler Port mit `AUTOKOSOVA_DB_PORT=55433` gesetzt werden; `DATABASE_URL` muss dann denselben Port verwenden.

## Produktregeln

Qualität vor Billigpreis. Kein Bietermodell. Suche, Profile und Direktkontakt ohne Konto. Ein Ort mit Radius oder mehrere Orte mit jeweils eigenem Radius. Unternehmensprüfung ist keine Reparaturgarantie. Bewertungen und organisches Ranking sind nicht käuflich.

## Reparaturanfrage lokal prüfen

`/anfrage` führt schrittweise durch optionale Fahrzeugdaten, Leistung/Symptom sowie einen bis drei
Orte mit 5–100 km Luftlinienradius und lokale Reisedaten. Gäste behalten den Entwurf nur im
Browser und können damit zur Suche weitergehen. Nur nach OIDC-Anmeldung kann die Anfrage über die
private API dauerhaft gespeichert werden. Der Suchübergang enthält ausschließlich Leistung und
Orts-/Radiusfilter; es wird nichts automatisch an Werkstätten gesendet. Fotos und Diagnoseberichte
bleiben optional und privat; ohne einen konfigurierten Objektspeicher werden sie in der lokalen
Entwicklungsoberfläche nicht hochgeladen.

## Öffentliche Suche lokal prüfen

`/suche?places=xk-pristina%3A20&service=bremsen` verwendet nur veröffentlichte Werkstattprofile,
den gepflegten Leistungsfilter und Ortskreise als Luftlinie. Mehrere Orte werden mit Komma getrennt,
zum Beispiel `places=xk-pristina:20,xk-prizren:30`. Optional sind `vehicleMake=skoda` und
`language=Deutsch`. Suchanfragen enthalten keine privaten Anfragewerte. Ohne Kartenanbieter bleibt
die Ergebnisliste mit Entfernung zum passenden Suchort funktionsfähig.

## Direktkontakt lokal prüfen

Ein veröffentlichtes Profil unter `/werkstatt/<id>` zeigt nur freigegebene Profildaten sowie den
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
