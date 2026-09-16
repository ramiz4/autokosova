# AutoKosova

**Qualitätsorientierte Werkstattsuche in Kosovo für die Diaspora.**

Passende Werkstatt anhand nachvollziehbarer Erfahrungen, Spezialisierung und Standort finden und selbst direkt kontaktieren.

[Rollen und Berechtigungen](docs/architecture/ROLES-AND-PERMISSIONS.md)

## Projektstand

Privates Repository mit Produktplanung und technischer Grundlage. Der Stack ist in [ADR-001](docs/architecture/ADR-001.md) und [ADR-002](docs/architecture/ADR-002.md) festgelegt; Marke, Domain und Anbieterbestellungen sind weiterhin nicht freigegeben.

- [Produktbrief und MVP](docs/PRODUCT_BRIEF.md)
- [Monetarisierung](docs/MONETIZATION.md)
- [Epics und Umsetzungsreihenfolge](docs/BACKLOG.md)
- [Arbeitsregeln für Entwickler und AI Agents](AGENTS.md)
- [Designrichtung und Präzisierungen](docs/design/README.md)
- [ZITADEL-Integration und offenes Login-Gate](docs/architecture/AUTH-INTEGRATION.md)

Die eigene Kontoauskunft, Profilseite `/profile` und noch offene echte Test-OIDC-Abnahme sind in [ACCOUNT-PROFILE.md](docs/architecture/ACCOUNT-PROFILE.md) beschrieben.

- [Werkstattaufnahme, Prüfung und Bildschutz](docs/architecture/GARAGE-ONBOARDING.md)
- [Kontogebundene Favoriten und Sitzungsanzeige](docs/architecture/FAVORITES.md)
- [Öffentliche Mehrortsuche und nachvollziehbares Matching](docs/architecture/SEARCH-MATCHING.md)
- [Bewusster Direktkontakt über WhatsApp oder Telefon](docs/architecture/DIRECT-CONTACT.md)
- [Bewertungen und private Besuchsnachweise](docs/architecture/REVIEWS.md)
- [Öffentliches Werkstattprofil](docs/architecture/GARAGE-PROFILE.md)
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

### Login und vollständiger OIDC-Logout

Ein Login-Klick fordert jetzt erneut aktive Authentifizierung beim Provider an.
Für zusätzliches Beenden seiner Browser-SSO-Sitzung das optionale Paar
`ZITADEL_END_SESSION_ENDPOINT` / `ZITADEL_POST_LOGOUT_URI` konfigurieren und
`http://localhost:4200/auth/logout/callback` exakt beim Testprovider registrieren.
Ohne dieses Paar wird ausschließlich lokal abgemeldet und diese Grenze sichtbar erklärt.
Details, sichere Rücksprünge, andere Ports und Testgrenzen stehen in
[AUTH-INTEGRATION.md](docs/architecture/AUTH-INTEGRATION.md#vollständige-abmeldung-und-bewusste-erneute-anmeldung-75).

### Profilangaben nach dem Login

Anzeigename, E-Mail und Benutzername kommen aus verifizierten ID-Token-Claims beziehungsweise
serverseitigem ZITADEL-UserInfo. Der bestehende Scope `openid profile email` genügt; der
UserInfo-Endpunkt wird standardmäßig aus der vertrauenswürdigen Issuer-Discovery ermittelt.
`ZITADEL_USERINFO_ENDPOINT` ist nur ein optionaler Same-Origin-Override, keine neue Pflichtvariable.
Nach dem Update bestehende Sitzungen einmal ab- und wieder anmelden. Ein tatsächlicher
Provider-Abruffehler wird auf `/profile` getrennt von fehlenden Angaben angezeigt.
Details und der noch fehlende echte Testkonto-Nachweis: [ACCOUNT-PROFILE.md](docs/architecture/ACCOUNT-PROFILE.md).

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

## Automatisierte funktionale E2E-Abnahme

```sh
npx playwright install chromium
npm run test:e2e
```

Die Suite baut die App und prüft Kunden-/Werkstatt-CRUD, Kontentrennung, Fehler, drei Sprachen,
Desktop/Mobil und einen echten Anwendungsneustart. Sie verwendet eigene Testdatenbanken und
den signierenden Test-OIDC; laufende App und echte Konten werden nicht verändert.
Der Check `e2e-acceptance` läuft vor dem Merge im PR und danach auf `main`.
Details zu Abnahmeinventar, lokalen Einzeltests, Secret-freiem CI und der derzeit fehlenden
administrativen Merge-Sperre: [E2E-ACCEPTANCE.md](docs/development/E2E-ACCEPTANCE.md).
Der separate echte ZITADEL-Test ist opt-in und kein funktionales Abschlussgate.

## Lokale Test-OIDC-Konten

Die fiktiven Konten für Kunde, Werkstattmitglied, Moderator und Admin liegen mit ihren Passwörtern
und aktuellen Subjects ausschließlich im freigegebenen 1Password-Store. Die instanzspezifische lokale Konfiguration
für ZITADEL wird daraus gezielt in Prozessvariablen oder eine ignorierte `.env.local`
übernommen. Der Starter liest 1Password nicht automatisch; weder `.env.example` noch Git, CI oder Logs enthalten
Zugangsdaten. Der Server übernimmt `admin` und `moderator` ausschließlich aus dem verifizierten
ZITADEL-Projektrollen-Claim. Details und die Garage-Membership-Grenze stehen in
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

## Eigene Anfragen verwalten

`/inquiries`, `/sq/inquiries` und `/en/inquiries` zeigen die tatsächlich in PostgreSQL gespeicherten eigenen Anfragen. Bearbeiten, Deaktivieren/Reaktivieren und bestätigtes Löschen verwenden die private API mit CSRF- und Versionsschutz. Ohne konfigurierte DB wird keine dauerhafte Speicherung bestätigt. Der lokale Erstellungsentwurf bleibt unabhängig. Verträge, Löschgrenze und DB-Browsernachweis: [MY-INQUIRIES.md](docs/architecture/MY-INQUIRIES.md).

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

### Eigene Favoriten

Unter **Mein Konto → Favoriten** (`/favorites`, `/sq/favorites`, `/en/favorites`) stehen die
in der Werkstattsuche gespeicherten Betriebe, unabhängig von den letzten Suchfiltern.
Profile werden seitenweise geladen; nicht mehr öffentliche Profile bleiben neutral und
entfernbar. Die bestätigte Entfernung wird im gemeinsamen Herz-Zustand berücksichtigt.
Ohne Datenbank werden Favoriten nicht als dauerhaft gespeichert bestätigt. Verträge und
Prüfgrenzen: [FAVORITES.md](docs/architecture/FAVORITES.md). Der DB-Browsernachweis läuft
nach Build, Migrationen und explizitem lokalem Demo-Seed mit
`node scripts/favorites-db-browser-smoke.mjs`; CI erstellt isolierte Testdaten dafür.

## Demo-Konten mit eigenen Daten

Privatkunden und Werkstattbetreiber erhalten eigene Kontomenüs. Der zusätzlich
konfigurierte Workflow-Seed weist den zwei freigegebenen OIDC-Testkonten jeweils
zwei eigene Datensätze zu; Änderungen und Löschungen bleiben bei Neustarts erhalten.
Die tatsächlichen Test-Subjects werden ausschließlich lokal konfiguriert, niemals
über E-Mail-Claims als Berechtigung verwendet. Einrichtung, Fixture-IDs und die
bewusste Löschgrenze: [Demo-Konten und Datenbesitz](docs/development/DEMO-ACCOUNT-OWNERSHIP.md).

## Administration und Moderation lokal prüfen

`npm run dev:demo-workflows` ist der vollständige lokale Demo-Einstieg. `dev:demo` bleibt das öffentliche Werkstattprofil, `dev` der Referenzdatenstart. Für den manuellen Mitarbeitendenablauf sind die bestehende freigegebene OIDC-Konfiguration und tatsächliche Projektrollen notwendig. Die ignorierte lokale Konfiguration kann `AUTOKOSOVA_DEMO_ADMIN_SUBJECT` und `AUTOKOSOVA_DEMO_MODERATOR_SUBJECT` aus der freigegebenen Subject-Zuordnung enthalten. Keine Werte aus E-Mail/Kontonamen ableiten und keine Rolle durch den Seed erzeugen.

Ein Moderator ohne konfigurierte Zuordnung bekommt keine fremden Fälle. Sein regulärer erfolgreicher Login trägt die verifizierte Rolle in das eingeschränkte Zuweisungsverzeichnis ein; deshalb für die erste manuelle Demo zuerst Moderator anmelden, abmelden, danach Admin anmelden. Bei mehreren Konten werden die fremden Daten nach Logout nicht weiterverwendet. Eine geänderte bestehende Demo-Bindung wird abgewiesen statt Datensätze einem anderen Konto zuzuschreiben.

| Fiktiver Szenarioschlüssel     | Rolle und Ausgang                  | Aktion / erwartetes Ergebnis                                                                           |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `demo-staff-review-unassigned` | Admin, unzugewiesen                | Fall ansehen, verifizierten Moderator wählen und zuweisen.                                             |
| `demo-staff-review-assigned`   | Zugeordneter Moderator, in Prüfung | Fall ansehen, privaten fiktiven Nachweis öffnen, drei Prüfpunkte bearbeiten und begründet entscheiden. |
| `demo-staff-review-mismatch`   | Zugeordneter Moderator             | Lesbarer, aber absichtlich unpassender Nachweis; keine positive Prüfung vortäuschen.                   |
| `demo-staff-review-blocked`    | Zugeordneter Moderator             | Gesperrter synthetischer Scanstatus; kein Dateiinhalt und keine Veröffentlichung.                      |
| `demo-staff-review-foreign`    | Andere fiktive Identität           | Für den regulären Moderator weder Liste noch Detail/Datei zugänglich.                                  |
| `demo-staff-review-escalated`  | Admin                              | Gespeicherte Eskalation in der Gesamtübersicht sehen.                                                  |

Zusätzliche, eindeutig fiktive Moderationsfälle werden nur bei der erstmaligen Anlage ergänzt:

| Szenario-ID                         | Vorbereiteter Zustand                                             | Erwartetes Ergebnis                                                                |
| ----------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `demo-staff-review-waiting`         | Rückfrage offen                                                   | Nachweisprüfung oder begründete Ablehnung; kein behaupteter Nachrichtenversand.    |
| `demo-staff-review-appeal`          | Widerspruch gegen frühere Ablehnung einer anderen fiktiven Person | Unabhängige Prüfung und neue Entscheidung, alte Historie bleibt.                   |
| `demo-staff-review-own-appeal`      | Widerspruch gegen Entscheidung desselben Moderators               | Keine Entscheidung; begründet an Admin übergeben.                                  |
| `demo-staff-review-reported-report` | Gemeldete veröffentlichte Bewertung                               | Inhaltsprüfung, vorläufig ausblenden und zulässig wiederherstellen.                |
| `demo-staff-review-restore-report`  | Im selben Fall ausgeblendete Bewertung                            | Wiederherstellung nur bei weiterhin gültiger Freigabe.                             |
| `demo-staff-review-removed-report`  | Zurückgezogene Bewertung                                          | Keine Wiederherstellung.                                                           |
| `demo-staff-profile-report`         | Separates fiktives veröffentlichtes Profil                        | Text und öffentliche Demo-Bilder prüfen; Ausblenden ist keine Unternehmensprüfung. |

Listen sind nach Priorität und Eingangszeit geordnet und paginiert; Status, Fallart und Priorität sind filterbar. Admins können zusätzlich eskalierte Fälle filtern. Ein leeres Moderatorkonto erhält niemals die globale Liste. Nicht verfügbare Bilder oder einzeln zu entfernende Antworten ohne eigenen abgesicherten Bearbeitungsvertrag werden an Admin eskaliert, nicht durch Löschen unbeteiligter Bewertungen ersetzt.

Der interne Einstieg zeigt standardmässig nur handlungsbereite Fälle; abgeschlossene Fälle sind über die ausdrücklich benannte Gesamtansicht erreichbar. Ein Fall besitzt zusätzlich die stabile kanonische Detailadresse `/admin/cases/:caseId` beziehungsweise `/moderation/cases/:caseId` (mit optionalem `/sq` oder `/en` Präfix). Die ID ist ausschliesslich technisch; bei Reload und Sprachwechsel prüft der Server den Zugriff erneut. Eine Admin-Übernahme lädt im selben Fall die aktuelle serverseitige Zuweisung und Fähigkeiten nach, statt den Arbeitskontext still in die Liste zurückzusetzen.

Durchlauf: **Admin zuweisen → regulär abmelden → Moderator Fall ansehen / Nachweis öffnen → begründet zur Adminprüfung geben → Admin findet Eskalation.** Nach Rückgabe verliert der Moderator diesen Fallzugriff. Der gemeinsame Arbeitsbereich umfasst Zuweisung, Fallkontext, Nachweischeckliste, Entscheidungen, Rückfragen, Wiederherstellung und unabhängige Widersprüche. Der Kunden-Einreichungsweg wird in #99, die übrige Administration in #94 ergänzt. Die erhöhten Rollen vergeben keine Eigentümer- oder Providerrechte.

Alle Nachweise sind klar markierte synthetische Textdateien, keine echten Rechnungen. Der Starter aktiviert `AUTOKOSOVA_LOCAL_DEMO_FILES=1` ausschliesslich für seinen lokalen Workflow-Demoprozess. Bei direktem Test-SSR-Start ist diese explizite Freigabe ebenfalls erforderlich. Der Adapter bleibt in Produktion und bei nichtlokaler Datenbank gesperrt und akzeptiert keine beliebigen Dateien, Speicherpfade oder Uploads. Er ist kein Malware-Scanner. Downloads sind kurzlebig, einmalig, sitzungs-/objektgebunden und werden bei jeder Einlösung erneut autorisiert.

Normales Neuladen, App-Neustart und erneuter Seed erhalten Zuweisungen, Entscheidungen, Eskalationen, vorhandene Kunden-/Werkstattdaten und Löschungen. Ausgangszustand nur mit einer frischen isolierten Worktree-DB oder einer ausdrücklich gewählten vorhandenen Reset-Funktion herstellen; der Start führt keinen Reset aus.

Automatisierter Nachweis: `npm run test:staff:browser` nach dem Build, mit lokaler isolierter `DATABASE_URL` und Chrome/Chromium (`CHROME_BIN` bei abweichendem Installationspfad). Der Test erstellt nur seine eigene flüchtige Test-Schema-/Browserumgebung, nutzt den signierenden OIDC-Testprovider und löscht anschliessend ausschliesslich diese Testressourcen. `test/staff-foundation-postgres.test.ts` und `test/moderation-workspace-postgres.test.ts` prüfen zusätzlich einen Runtime-Benutzer ohne Tabellenbesitz/RLS-Bypass. Die Moderator-Formulare werden in DE/SQ/EN bei 390/1280 px mit tatsächlichen Browseraktionen geprüft; `staff-decision-form.component.spec.ts` ergänzt Pflichtfelder, Abbruch und Eingabeerhalt. Tatsächliche externe Testkonto-Anmeldung wird nicht aus diesen synthetischen Ergebnissen abgeleitet.

## Kundenbewertung und Werkstattantwort lokal prüfen

`npm run dev:demo-workflows` verwendet zusätzlich zur Staff-Basis die vorhandene freigegebene Kunden-/Werkstatt-Kontozuordnung. `demo-customer-review-pending` ist eine eigene eingereichte Bewertung; `demo-customer-review-published` eine fiktive veröffentlichte Bewertung für Kundenupdates. Der bestehende Moderatorbestand bleibt erhalten. Ein erneuter Seed setzt Entscheidungen, Änderungen oder Löschungen nicht zurück.

Durchlauf: Im veröffentlichten Demo-Profil „Bewertung schreiben“ wählen, regulär anmelden, fiktiven Beispielnachweis über den sichtbaren Link speichern und als `.txt` hochladen. Ausschliesslich die bereitgestellten fiktiven Bytes werden angenommen; keine echten Rechnungen verwenden. Vier Kriterien, Leistung und Besuchsmonat erfassen und zur Prüfung einreichen. In `/reviews` erscheint zunächst der tatsächliche Prüfstatus, nicht eine angebliche Veröffentlichung.

Danach Admin zuweisen → Moderator Nachweis prüfen und begründet entscheiden → Kundenstatus/öffentliche Anzeige prüfen. Ein berechtigtes Werkstattkonto kann im öffentlichen Bewertungsabschnitt antworten; der Autor kann in seinen Bewertungsdetails Reklamation/Nacharbeit ergänzen. Beide Aktionen verändern die Originalbewertung nicht. Ohne lokale Dateifreigabe sind Uploads erkennbar nicht verfügbar. Echte Ablage-, Scan- und Aufbewahrungsfreigaben werden durch diesen Demoablauf nicht ersetzt.

Automatisierte Abnahme: `npm run verify` mit lokaler DB, `npm run test:staff:browser` und `npm run test:e2e`. Letzteres enthält zusätzlich die Pflichtfälle `review-workflow` und `review-boundaries` auf Desktop/Mobil. Screenshots/Testreports enthalten nur synthetische Daten; Kontozugangsdaten bleiben in der freigegebenen lokalen Verwaltung.

## Vollständige lokale Administration

`npm run dev:demo-workflows` bereitet zusätzlich die Adminfälle vor. Ein regulärer Adminlogin öffnet `/admin` mit echtem Handlungsbedarf. Die Navigation führt zu Werkstattprüfung, Benutzern/Mitgliedschaften, Datenschutz, Audit, Katalog und dokumentierter Supportaufnahme. Alle Bereiche existieren ebenso unter `/sq` und `/en`. Die Fallbearbeitung wird aus der Moderation wiederverwendet.

| Fiktiver Datensatz               | Übung                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo-admin-garage-pending`      | Unternehmensdokument öffnen, vier Prüfpunkte/Position kontrollieren, begründet veröffentlichen; Foto separat freigeben                                            |
| `demo-admin-garage-incomplete`   | Fehlender Unternehmensnachweis verhindert Veröffentlichung; Aufnahmeantrag begründet ablehnen                                                                     |
| `demo-admin-garage-members`      | Editor widerrufen, letzten Eigentümer schützen und an `demo-admin-next-owner` übertragen                                                                          |
| `demo-admin-garage-suspended`    | Administrative Sperre prüfen und nur bei gültigen Voraussetzungen zurücknehmen                                                                                    |
| `demo-admin-garage-unrestorable` | Administrative Sperre ohne Unternehmensnachweis; Wiederherstellung bleibt gesperrt. Widerrufene Zuordnung `demo-admin-former-editor` hat keinen Werkstattzugriff. |
| `demo-admin-deletion-policy`     | Ohne freigegebene Policy gesperrt; keine erdachten Produktivfristen verwenden                                                                                     |
| `demo-admin-deletion-ownership`  | Eigentumsübergabe oder andere erforderliche Betreiberentscheidung vor Löschung klären                                                                             |

Die dafür vorgesehenen synthetischen Konten sind Datenobjekte für die Tests, keine Passwörter, Login-Bypässe oder lokal vergebenen Mitarbeiterrollen. Neue Starts verändern erledigte Fälle, Sperren, Memberships oder gelöschte Datensätze nicht. Unternehmensdateien verwenden dieselben sitzungsgebundenen Einmal-Grants wie die Staff-Demo. Fotos bleiben bis zu ihrer eigenen Freigabe nicht öffentlich. Vorhandene Kunden-/Werkstatt-Demozuordnungen bleiben bestehen.

Unter „Unterstützte Werkstattaufnahme“ einen tatsächlichen dokumentierten Auftrag angeben, den bereits vorhandenen Antragsteller wählen und das normale Aufnahmeformular verwenden. In der synthetischen Abnahme sind Referenzen ausdrücklich als `SYNTHETIC`/`DEMO` markiert. Adminrolle bedeutet keine Eigentümerschaft; Originalkonten werden nicht nachgeahmt.

Globale Rollen, Passwort, MFA und Identitätssperren bleiben in ZITADEL. Optional kann der Betreiber `AUTOKOSOVA_ADMIN_CONSOLE_URL` in der bestehenden lokalen/Serverkonfiguration hinterlegen; nur freigegebene HTTPS-URL ohne Zugangsdaten/Query/Fragment. Ohne Konfiguration zeigt die Seite den externen Weg, keine geratenen Links. „Lokale App-Sitzungen beenden“ ersetzt keine anbieterweite Kontosperre. Rollenabgleich und diese Grenze stehen in der Rollenreferenz.

Abnahme: `npm run verify` mit eigener lokaler Datenbank, `npm run test:staff:browser` und `npm run test:e2e`. Die Pflichtfälle `admin-workflow` und `admin-boundaries` ergänzen Kunden-/Werkstatt-/Bewertungsabläufe auf Desktop/Mobil. Der neue DB-Test verwendet einen Nichtbesitzer ohne RLS-Bypass und prüft auch die tatsächliche owner-only Datenlöschung. Echte Betreiber-/Dateispeicher-/Malware-/Providerfreigaben bleiben von den synthetischen Testergebnissen getrennt.

### Aktualisierung eines frühen Admin-Entwicklungsstands

Die zwischenzeitlich lokale `080_administration.sql` wurde unverändert nach `082_administration.sql`
verschoben, weil #99 die reguläre Migration `080_review_contribution_lock.sql` ergänzt hat.
`db:migrate` erkennt ausschließlich den vollständig ausgeschriebenen alten Dateinamen in der
Migrationshistorie, erhält dessen Ausführungszeit und führt die unabhängigen Review-Migrationen
normal aus. Vorhandene Datensätze werden nicht zurückgesetzt; ein bloß vorhandenes Datenbankfeld
wird nicht als erfolgreich ausgeführte Migration interpretiert. Widersprüchliche doppelte Einträge
stoppen den Start. Die Aufwärtsmigration und erneuter Start sind in
`test/administration-migration-postgres.test.ts` mit tatsächlich erhaltenen Änderungen geprüft.
