# Prüfprotokoll: Demo-Konten und Datenbesitz (#81)

Geprüft am 15.09.2026 im isolierten Worktree `autokosova-demo-accounts`, Branch
`feat/81-demo-account-ownership`, Ausgangspunkt `252b92d`. Die bestehende lokale
Hauptarbeitskopie und deren Datenbank wurden für die Implementierung nicht geändert.
Die Migration wurde über den normalen Worktree-Entwicklungsstarter angewendet.
Zusätzliche DB- und Browserprüfungen verwendeten ausschließlich zufällige eigene
Testschemas, die danach wieder entfernt wurden.

## Tatsächliche Ergebnisse

| Prüfung | Ergebnis |
|---|---|
| `npm run format:check` | Erfolgreich |
| `npm run lint` | Erfolgreich |
| `npm run typecheck` | Erfolgreich |
| `npm test -- --watch=false` | 200 Tests erfolgreich, 23 Testdateien |
| `npm run test:server` mit lokaler Worktree-PostgreSQL-DB | 100 erfolgreich, 0 fehlgeschlagen; 2 explizite Profilprüfungen standardmäßig übersprungen |
| `npm run test:demo-seed` in separat mit `demo` geseedetem Schema | 1 erfolgreich |
| `npm run test:demo-workflow-seed` in separat mit `demo-workflows` geseedetem Schema | 1 erfolgreich |
| `npm run build` | Erfolgreich |
| `npm run test:smoke` | Erfolgreich |
| `node scripts/demo-accounts-browser-smoke.mjs` | Erfolgreich; echter Chromium-Browser mit signiertem lokalem OIDC-Testprovider und PostgreSQL |
| `npm run test:dev` | 16 erfolgreich, 1 bestehender lokaler Toolchain-Fehler; siehe unten |

Die öffentliche Demo-Profilprüfung erwartet ausdrücklich keine Workflow-Bewertungen.
Ein erster Aufruf gegen die bereits mit `demo-workflows` geseedete Datenbank scheiterte
daher erwartbar am falschen Datenprofil. Die abschließenden Profilprüfungen wurden
getrennt auf den jeweils richtigen, frisch aufgebauten Schemas ausgeführt.

Die neue parallele Schemaverwendung machte außerdem einen bestehenden, nicht auf das
aktuelle Schema begrenzten Index-Test sichtbar. Dessen Abfrage in
`test/inquiries-postgres.test.ts` ist jetzt auf `current_schema()` begrenzt.

## Abgedeckte Abläufe

Die API-Prüfungen decken beide Kontozwecke, mehrere zugeordnete Objekte, Anlegen,
Bearbeiten und Löschen ab. Fremde Subjects, bloß identische E-Mail-Profilclaims,
Editoren, widerrufene Owner, Admin ohne eigene Owner-Membership und fehlender CSRF
geben keine Löschberechtigung. Der geschäftliche Kontozweck bleibt nach der letzten
Werkstattlöschung erhalten. Ein anfänglicher Membership-Konflikt bricht die gesamte
Demo-Zuordnung transaktional ab; ein abweichender Issuer kann nicht umgebunden werden.
Bearbeitete Datensätze und Löschungen überstehen mehrere Seeds verschiedener Profile.
Unabhängige Bewertungen bleiben gespeichert; gelöschte Werkstätten sind nicht öffentlich.

Der Browserlauf führte zwei echte Authorization-Code/PKCE-Austausche mit gültig
signierten Test-ID-Tokens durch. Er zeigte je zwei initial zugeordnete Datensätze,
unterschiedliche private/geschäftliche Menüs, persistierte eine Werkstattänderung,
bestätigte die native Löschabfrage und prüfte den Fortbestand der Löschung nach
Reseed plus Reload. Anschließend wurde zum getrennten Kundenkonto gewechselt und
der fremde Werkstattzugriff abgewiesen. Kein API-Response wurde abgefangen/ersetzt.

Desktop (1280 px) und Mobilansicht (390 px) wurden ohne horizontalen Überlauf geprüft.
Vier lokale Screenshots liegen ignoriert unter `test-results/demo-accounts/` und
enthalten ausschließlich fiktive Anwendungsdaten, keine Provider-/Callback-Seiten.
Die Werkstatt-Mobilansicht wurde zusätzlich visuell geprüft.

## Bestehender lokaler Toolchain-Fehler

`test/dev-install-policy.test.mjs` schlägt mit npm 11.12.1 fehl, weil der erwartete
Abbruch für ein nicht freigegebenes Installationsskript ausbleibt. npm meldet lokal
`Unknown project config "strict-allow-scripts"`. Derselbe Einzeltest wurde separat
auf der unveränderten Hauptarbeitskopie bei `252b92d` ausgeführt und scheiterte gleich.
Die Installations-Schutzrichtlinie wurde in diesem Branch weder entfernt noch gelockert.
Das ist kein vollständig grüner `test:dev`-Lauf und keine bestätigte CI-Ausführung.

## Nachtrag: tatsächliche Konto-Zuordnung am 15.09.2026

Die vom Nutzer freigegebenen 1Password-Einträge für die zwei fiktiven Testkonten
wurden gelesen. Die dort dokumentierten Subjects wurden ausschließlich in der
ignorierten, zugriffsbeschränkten `.env.local` des isolierten Worktrees konfiguriert.
Passwörter und Freigabelinks wurden nicht in Dateien, Git oder Prüfprotokolle übernommen.
Die bestehende Hauptarbeitskopie und ihre Datenbank bleiben unverändert.

Der normale `dev:demo-workflows`-Seed hat die tatsächlichen Konten gebunden.
Die lokale Datenbankprüfung bestätigt die Übereinstimmung von Subject und
konfiguriertem Issuer sowie folgende getrennte Zuordnung:

| Konto | Aktive eigene Werkstätten | Eigene Anfragen |
|---|---:|---:|
| `ak-test-garage-20260913@example.test` | 2, jeweils Owner | 0 |
| `ak-test-customer-20260913@example.test` | 0 | 2 |

Die zugewiesenen IDs entsprechen der Einrichtungsanleitung. Ein erneuter Seed
bewahrte die zugewiesenen Werkstatt- und Anfragezeilen unverändert; die Besitzanzahlen
blieben ebenfalls stabil. Es wurde kein Reset ausgeführt.

### Behobener Fehler im tatsächlichen Entwicklungsstart

Die bisherige Bereitschaftsprüfung verlangte `demo-prishtina-bremsen` in einer
5-km-Suche. Die Konto-Zuordnung ergänzt eine Demo-Adresse; der bestehende DB-Trigger
setzt dabei korrekt die Standortbestätigung zurück. Das Profil erscheint danach
nicht als bestätigter Radius-Treffer. Trotz erfolgreicher HTTP-/DB-Antworten brach
der Starter deshalb nach seinem Timeout ab. Eine spätere legitime Bearbeitung oder
Löschung dieser eigenen Werkstatt hätte denselben Fehler verursacht.

Die Prüfung verwendet nun `demo-prishtina-bremsen-offen`, die keinem interaktiven
Demokonto zugewiesen wird. Datenbankzugriff, konkrete Demo-Fixture und App-Instanz
werden weiterhin geprüft. Ein Regressionstest sichert die Unabhängigkeit vom
bearbeitbaren Demo-Set ab; ein weiterer schützt die neuen lokalen Subject-Variablen
vor Ausgabe in Entwicklungsdiagnosen. Alle 9 Tests in `test/dev-runtime.test.mjs`
wurden erfolgreich ausgeführt. Der korrigierte normale Starter meldete anschließend
`Bereit` auf `http://localhost:4200/`; die tatsächliche Suchantwort enthielt die neue
Prüf-Fixture.

### Weiterhin offene echte Login-Abnahme

Der Browser erreichte über den regulären `/auth/login`-Ablauf die echte
ZITADEL-Anmeldemaske. Der Anmeldename des Garage-Kontos wurde akzeptiert und führte
zur Passwortmaske. Die automatisierte Passworteingabe wurde jedoch vom Werkzeug
blockiert und nicht über einen anderen Ausführungspfad umgangen. Daher ist weder
eine erfolgreiche authentifizierte Sitzung noch ein echter CRUD-Durchlauf mit
einem der zwei bestehenden Konten behauptet. Die oben dokumentierten synthetischen
API-/Browserprüfungen bleiben davon getrennt.

Die tatsächliche Datenzuordnung ist abgeschlossen. Für die vollständige Abnahme
müssen beide Konten noch manuell angemeldet und ihre eigenen Verwaltungsabläufe
bestätigt werden. Der Entwicklungsstand läuft dafür im isolierten Worktree unter
Port 4200. Die Merge-Freigabe wurde am 15.09.2026 vom Nutzer ausdrücklich erteilt. Der Merge
erfolgt erst nach erfolgreicher CI und Prüfung. Die manuelle Provider-/Login-Abnahme
bleibt davon getrennt in #81 offen; sie wird durch den Merge nicht als erledigt
markiert. Es gab kein produktives Deployment und keine Provider-Konfigurationsänderung.

## Abschließende CI-Prüfung und Shutdown-Korrektur

Im CI-Lauf für `bc708a5` bestanden sieben von acht Checks nach einer einmaligen
Wiederholung des Browser-Fixture-Jobs. Dieser meldete im ersten Lauf nach den
bestandenen DE/SQ/EN-Ansichten einen Fehler beim Erfüllen einer abgefangenen
Testantwort (`Fixture response failed`); der unveränderte Wiederholungslauf bestand.
Es wurden keine Assertions abgeschwächt oder Tests entfernt.

Der echte Zwei-Worktree-Entwicklungsstart zeigte außerdem eine zurückbleibende
Startsperre beim Stoppen. Der äußere Testprozess und der innere Starter hatten
beide dieselbe 3-Sekunden-Abbruchfrist: Der äußere Prozess konnte den Starter
beenden, bevor dieser nach dem Stoppen von Angular seine Sperre entfernt hatte.
Die Smoke-Runner räumen dem Starter nun ein begrenztes 10-Sekunden-Fenster ein;
die innere Angular-Frist bleibt 3 Sekunden. Die Prüfungen auf verschwundene Sperren,
beendete eigene Prozesse und erhaltene DB-Daten bleiben unverändert.

Ein Regressionstest mit einer absichtlich über 3 Sekunden dauernden Bereinigung
bestätigte das vollständige Aufräumen. Alle 10 Entwicklungsruntime-Tests bestanden
lokal. Der vollständige CI-Lauf des abschließenden Commits ist separat maßgeblich.
