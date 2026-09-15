# Automatisierte funktionale Abnahme (#112)

## Abnahmegrenze

Die Pflichtsuite prüft die gebaute Anwendung mit Chromium, echter HTTP-API und PostgreSQL/PostGIS.
Nur der externe Identitätsanbieter wird durch den vorhandenen signierenden Test-OIDC ersetzt.
Authorization Code, PKCE, State, Nonce, UserInfo, Cookies und serverseitige Objektprüfungen bleiben aktiv.
Keine injizierten Anwendungssitzungen und keine erfundenen erfolgreichen CRUD-Antworten.
Eine vollständig erfolgreiche Pflichtsuite genügt für die funktionale Abnahme; keine anschließende
manuelle Pflichtprüfung. Das ist weder ein Test echter ZITADEL-Zugänge noch eine Usability-Studie.

## Lokal ausführen

Voraussetzungen: dokumentierte Node-Laufzeit, npm mit Installationsrichtlinien-Unterstützung,
lokale Docker-Engine/Compose und Chromium. Die CI-Referenz ist `.nvmrc` plus npm 11.19.0.

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Der Einstieg baut die Anwendung selbst. Er verwendet einen eigenen, aus dem Worktree abgeleiteten
Compose-Testbereich im temporären Verzeichnis, nicht die laufende App, deren Port oder Datenbank.
Der vorhandene Docker-Ownership-Check prüft Container und Volume. Die Testdatenbanken werden je
Szenario neu unter zufälligen `ak_e2e_*`-Namen erzeugt, ausschließlich diese wieder entfernt.
Das Test-Container-Volume bleibt erhalten; es enthält nach ordnungsgemäßem Abschluss keine Szenariodaten.
Eine Sperre verhindert gleichzeitige E2E-Läufe aus demselben Worktree. Verwaiste Sperren erst nach
Prüfung des zugehörigen Prozesses entfernen; nicht pauschal fremde Prozesse oder Volumes bereinigen.

Nur CI oder ein ausdrücklich eigener Testserver kann `AUTOKOSOVA_E2E_DATABASE_URL` setzen.
Erlaubt ist eine lokale PostgreSQL-URL zur Kontrolldatenbank `autokosova`, ohne Query-/Pfad-Overrides.
Die Kontrolldatenbank muss CREATE/DROP DATABASE für die ausschließlich eigenen Szenariodatenbanken erlauben.
Ein vorhandenes `DATABASE_URL` oder echte ZITADEL-/1Password-Umgebungsvariablen werden nicht übernommen.

```sh
npm run test:e2e -- --grep persistent-restart
npm run test:e2e -- --project mobile
npm run typecheck:e2e
npm run test:e2e:policy
```

Gefilterte lokale Läufe sind ausdrücklich Diagnose, keine vollständige Abnahme. CI erlaubt keine Filter.

## Verbindliche Szenarien

Acht unabhängige Szenarien in fünf fachlichen Bereichen, jeweils Desktop 1280×900 und Mobil 390×844; Menü-/Sprachprüfungen zusätzlich bei 360/430 px:

| ID | Nachweis |
|---|---|
| `customer-crud` | Assistent-Neuanlage, Fahrzeugdaten, Bearbeiten/Reload, Aktivierung/Filter/Fokus, bestätigte Löschung, eigener Browserentwurf und bestehende Datensätze bleiben erhalten |
| `garage-crud` | Echte Formular-Neuanlage, Entwurfsstatus, Leistungen/WhatsApp, Bearbeiten/Reload, Löschung, bestehende Betriebe unverändert |
| `published-deletion` | Sichtbar vor Löschung, danach weder private Verwaltung noch öffentliche Suche/Profil; Betreibertyp und Neuanlage nach letzter Membership |
| `account-isolation` | Normale Logins, fremde Lese-/Schreib-/Löschzugriffe, Editor versus Owner, CSRF, Logout |
| `persistent-restart` | Beide zugewiesenen Demo-Anfragen editierbar; Änderungen/Löschungen über echten Prozessneustart, Migrationen und Demo-Seed hinweg erhalten |
| `localized-navigation` | DE/SQ/EN, beide Kontotypen, explizite Rücksprünge, Tastatur/Fokus, Layout und private SSR-Header |
| `error-feedback` | Tatsächliche Revisionskonflikte, CSRF-/Membership-Verweigerung, gezielter Netzwerkabbruch, keine falsche Bestätigung, Abbruchschutz |
| `late-response` | Tatsächlich autorisierte, nur verzögerte Antwort darf nach Kontowechsel keine alten privaten Daten wiederherstellen |

Setup/zusätzliche Nachkontrolle darf API/SQL nutzen; die abzunehmende Neuanlage/Bearbeitung/Löschung
führt normale Playwright-Bedienaktionen aus. Fehlerprovokation darf Requests abbrechen oder reale
Antworten verzögern, aber keine erfolgreichen CRUD-Antworten erfinden. Spezialisierte Unit-/API-
Fehlerregressionen bleiben bestehen statt einer Kombinationsexplosion über alle Browser/Sprachen.

## CI, Ergebnisse und Abschluss

`.github/workflows/e2e.yml` führt `e2e-acceptance` bei PRs gegen `main`, jedem Push auf `main`
und manuellem Workflowstart aus. Der Standard-PR-Checkout prüft die GitHub-Integrationsref,
der Push-Lauf den tatsächlich gemergten Commit. Kein Deployment und keine Repository-Schreibrechte.

Ein Worker, null Wiederholungen, `forbidOnly` und feste Pflichtinventarliste verhindern Teilabnahme.
Der Reporter lehnt leere/fehlende/doppelte Fälle, Skip, erwartete Fehler, Abbruch, Timeout und
Retry-Erfolge ab. Ein unabhängiger Starter prüft zusätzlich die frisch geschriebene Ergebnisdatei, Lauf-Nonce, Commit und das vollständige Inventar; ein fehlgeschlagener Reporter kann so keinen falschen Erfolg ergeben. `test:e2e:policy` prüft diese Regeln sowie den tatsächlichen Playwright-Exitcode
mit erfolgreichen und absichtlich fehlerhaften/übersprungenen/leeren Tests. Fehler werden nicht
mit `continue-on-error` verdeckt. Main-Läufe werden nicht zugunsten nachfolgender Pushes abgebrochen.

Artefakte (7 Tage): `test-results/e2e/acceptance.json` mit geprüfter Commit-SHA, Testinventar und Status
sowie ausdrücklich erzeugte Screenshots bekannter synthetischer Anwendungsseiten. Keine Traces,
Videos, gespeicherten Auth-Sitzungen, Providerbilder oder Netzwerkdumps. Playwright-Diagnosetexte
bleiben lokal; CI lädt ausschließlich die freigegebenen JSON-/PNG-Dateien hoch.

### Technische Merge-Sperre: derzeit externe Einschränkung

Bei Implementierungsbeginn am 15.09.2026 hatte der verfügbare GitHub-Zugang Push-, aber keine
Administrationsrechte. Der Ruleset-Endpunkt meldete zusätzlich HTTP 403 mit der Anforderung
GitHub Pro oder öffentliches Repository. **Eine technische Merge-Sperre ist damit nicht eingerichtet
und nicht nachgewiesen.** Kein Planwechsel, keine Veröffentlichung und kein Ausweichen auf andere
Credentials wurde vorgenommen. Die CI selbst ist fail-closed, reguläre Merges werden anhand der
aktuellen erfolgreichen Checks geprüft; das ersetzt keine serverseitige Merge-Sperre.

Nach Bereitstellung geeigneter Rechte/Plan: `e2e-acceptance` als erforderlichen Check mit aktueller
Zielbranch-Basis und ohne Bypass eintragen, bestehende Qualitätschecks beibehalten. Danach mit einem
absichtlich roten Prüf-PR die tatsächliche Sperre überprüfen; diesen Prüfstand niemals mergen.
Es gibt keinen eigenen Schließungsbot. Der Implementierungs-PR schließt #112 durch `Closes #112`
beim regulären Merge nach erfolgreicher Abnahme; der anschließende Main-Lauf wird separat geprüft.
Ein dortiger Fehler wird behoben und nicht als bestandene Prüfung bezeichnet.

## Separater echter ZITADEL-Durchlauf

`npm run test:e2e:real` ist ausdrücklich opt-in und kein PR-Pflichtcheck. Ohne vollständige
Konfiguration beendet er sich mit **Exit 2 / NOT RUN**, ohne Browser oder Providerkontakt.
Er startet/stoppt keine Anwendung oder Datenbank. Es werden ausschließlich die im Lauf selbst
angelegten, eindeutig markierten Datensätze verändert und bereinigt. Zwei echte Konten werden
nacheinander in isolierten Browserkontexten geprüft; eine lokale Ursprungssperre verhindert
konkurrierende Läufe dieses Starters. Andere manuelle Bearbeitungen derselben Testkonten pausieren.

Laufzeitvariablen aus der bereits freigegebenen Secret-Verwaltung bereitstellen, nicht in Git:

| Variable | Bedeutung |
|---|---|
| `AUTOKOSOVA_E2E_REAL=1` | ausdrückliche lokale Testfreigabe |
| `E2E_REAL_BASE_URL` | freigegebene laufende lokale App, z. B. `http://localhost:4200` |
| `E2E_REAL_ISSUER` | exakter HTTPS-Issuer der Testinstanz |
| `E2E_REAL_LOGIN_ORIGIN` | optional abweichender ausdrücklich freigegebener Login-Ursprung |
| `E2E_REAL_CUSTOMER_LOGIN`, `E2E_REAL_CUSTOMER_PASSWORD`, `E2E_REAL_CUSTOMER_SUBJECT` | bestehendes Privat-Testkonto |
| `E2E_REAL_GARAGE_LOGIN`, `E2E_REAL_GARAGE_PASSWORD`, `E2E_REAL_GARAGE_SUBJECT` | bestehendes Betreiber-Testkonto |
| `E2E_REAL_HEADED=1` | optional sichtbarer Browser für reguläre menschliche MFA-Freigabe |
| `E2E_REAL_USERNAME_SELECTOR`, `E2E_REAL_PASSWORD_SELECTOR`, `E2E_REAL_SUBMIT_SELECTOR` | optional konkrete Selektoren der freigegebenen Provider-Version; keine anderen Ursprünge freigeben |

Ein autorisierter lokaler `op run`-Aufruf kann diese Variablen zur Laufzeit bereitstellen. Der Starter
selbst liest weder 1Password-Einträge noch Share-Links, `.env`-Dateien oder bestehende Browsersitzungen.
Passwörter/Subjects niemals in Shell-Argumente oder Historie kopieren. Es gibt keine Provideränderung,
keine MFA-Abschaltung und keine Umgehung zuvor blockierter Werkzeuge. Solange die tatsächliche
Passworteingabe im verwendeten Werkzeug nicht freigegeben ist, den Live-Lauf nicht darüber erzwingen.

Der kleine Standalone-Runner verwendet dieselben CRUD-Hilfen und normale Providerformularaktionen,
prüft Konto-ID/-typ über `/api/me` und meldet ausschließlich feste Schrittbezeichnungen/Status.
Der Provider-Login hängt von der freigegebenen konkreten ZITADEL-Oberfläche ab und ist erst nach
wirklichem Lauf bestätigt. Keine Traces, Screenshots, rohe Playwright-Fehler oder Auth-State-Dateien
für diesen Modus. Ergebnis: `test-results/e2e-real/summary.json`; fehlende Freigabe ist kein Erfolg.

## Übernommene und weiterhin spezialisierte Tests

Die fachlichen Kunden-/Werkstattabläufe der früheren `demo-accounts-browser-smoke.mjs` und
`inquiries-db-browser-smoke.mjs` werden durch diese Suite ersetzt. Die handgeschriebenen
CDP-Hilfen bleiben nur dort, wo noch spezialisierte Tests davon abhängen (Account-, Favoriten-,
Footer-, OIDC- und gezielt simulierte Layout-/Antworttests). Deren komplette Migration ist nicht
Bestandteil von #112. Historische Prüfprotokolle behalten ihre ursprünglichen Ergebnisse.
