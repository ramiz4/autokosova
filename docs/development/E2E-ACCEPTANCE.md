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

Das aktuelle Pflichtinventar in `scripts/e2e/policy.mjs` enthält 14 unabhängige Szenarien, jeweils Desktop 1280×900 und Mobil 390×844; Menü-/Sprachprüfungen zusätzlich bei 360/430 px:

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
| `review-workflow`, `review-boundaries` | Bewertungsabläufe und zugehörige Berechtigungsgrenzen |
| `admin-workflow`, `admin-boundaries` | Plattformverwaltung und zugehörige Berechtigungsgrenzen |
| `real-runner-contract` | Synthetische Regression der realen Runner-Hilfen: Profildaten, Aktivierung und nachweisbare End-Session-Navigation; lokale 401 allein reicht nicht |
| `real-harness-lifecycle` | Gebauter eigener App-Prozess, zufällige Test-DB, Laufzeit-Subject-Zuordnung und Cleanup; ohne echten Providerkontakt |

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

### Technische Merge-Sperre: historische Einschränkung und Einrichtung #119

Seit der ausdrücklichen Adminfreigabe am 16.09.2026 ist `main` tatsächlich geschützt: aktuelle
Branch-Basis, beide E2E-Checks und alle neun bisherigen Qualitätschecks (zehn verschiedene
Checknamen insgesamt), jeweils von GitHub Actions, auch für Administratoren. Keine Force-Pushes
oder Branch-Löschung. Der frühere Befund bleibt nachfolgend als historischer Nachweis erhalten.

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

## Separater echter ZITADEL-Durchlauf (#119)

Die echte Abnahme ist von `e2e-acceptance` getrennt. Für #119 müssen **beide Checks auf dem
aktuellen Integrationsstand wirklich erfolgreich** sein. Die synthetischen Runner-Regressionen
sind kein Ersatz für echte ZITADEL-Anmeldungen. Ein nur vorbereitetes Workflow und `NOT RUN`
erfüllen dieses Gate nicht. Einrichtungs-/Nachweisstand: [ZITADEL-Abnahmebericht](../validation/E2E-ZITADEL-ACCEPTANCE.md).

### Automatische Vertrauensgrenze in GitHub Actions

Seit dem ausdrücklichen Nutzerauftrag vom 16.09.2026 gibt es **keine manuellen Environment-
Approvals und keinen Wait Timer**. `e2e-zitadel` bleibt der isolierte Secret-Bereich und erlaubt
serverseitig nur `main` und `refs/pull/*/merge`. Die zehn erforderlichen Main-Checks,
aktuelle Main-Basis und Durchsetzung auch für Administratoren bleiben unverändert.

Der Workflow verwendet reguläres `pull_request`, Main-Push und optionalen manuellen Main-Start.
Ein automatischer Vorabjob ohne Checkout/Secrets prüft die ausdrücklich vertrauten Identitäten
`ramiz4` (1623235) und `ramizloki` (235666066), ihre aktuellen Schreibrechte und sowohl den
ursprünglichen als auch den erneut auslösenden Actor. Der PR-Autor muss ebenfalls dieser
benannten Vertrauensmenge angehören; Repositoryzugehörigkeit allein reicht nicht.
Ein PR muss offen, nicht Draft, intern, gegen `main` und auf dessen aktuellem Integrations-SHA
sein. Forks, andere Autoren/Actors, Rechteverlust und veraltete Integrationen scheitern geschlossen.
Dieselbe Prüfung läuft nach Installation/Build unmittelbar vor der Secret-Auflösung erneut.

Die bewusst gewählte Vertrauensgrenze ist der eigene Entwicklungs-/Automatisierungskreis:
Repository-Schreibrechte haben bei Einrichtung nur diese beiden Konten. Deren interner Code,
Workflows und Abhängigkeiten gelten für die dedizierten Testzugänge als vertrauenswürdig.
Das ist keine behauptete unabhängige Personenprüfung und keine Sandbox gegen einen bösartigen
Repository-Writer, der Workflowdateien selbst ändern kann. Neue Schreibberechtigungen oder Apps
mit Code-/Workflow-Schreibzugriff benötigen eine neue administrative Vertrauensentscheidung.
Ungeprüften Fremdcode nicht automatisch in interne Branches übernehmen. Fork-Workflows bekommen
keine Secrets; kein `pull_request_target`, privilegierter `workflow_run` oder künstlicher grüner Check.

Der abschließende `e2e-zitadel`-Check akzeptiert nur erfolgreiche Vorprüfung **und** Integration.
Untrusted/Skip/Abbruch/fehlende Konfiguration sind kein Erfolg. Keine Retries und kein
`continue-on-error`. Workflowübergreifend dieselbe Concurrency-Gruppe
`autokosova-real-zitadel-accounts`; laufende Abnahmen werden nicht abgebrochen. Der begrenzte
GitHub-Pending-Slot ist keine garantierte Warteschlange aller Commits.

### Environment, Vault und Verantwortlichkeiten

Betriebsverantwortlich für Test-Vault, Service-Account, Rotation und Widerruf ist **Ramiz Loki**;
das administrative Konto ist `ramiz4`. Der Service-Account ist auf 90 Tage begrenzt, Rotation
spätestens **01.12.2026**. Wiederherstellungsinformationen bleiben außerhalb des CI-Test-Vaults.
Die alte manuelle Reviewer-Regel wurde auf Nutzerauftrag entfernt, nicht durch einen
Auto-Approve-Bot ersetzt. Die regulären automatischen Required Checks bleiben verbindlich.

Ein eigener CI-Test-Vault enthält ausschließlich die beiden vorhandenen freigegebenen
Kunden-/Werkstatt-Testzugänge und die benötigte Test-OIDC-Konfiguration. Keine produktiven Konten,
Adminzugänge oder Kopie des gesamten bisherigen Administrations-/Privat-Eintrags. Der dedizierte
Service-Account erhält **nur Lesezugriff auf diesen einen Vault**, keine Schreib-/Share-/Vault-
Erstellungsrechte und keinen Zugriff auf weitere Vaults. Keine zusätzliche Connect-Infrastruktur.

`OP_SERVICE_ACCOUNT_TOKEN` ist ausschließlich ein **Environment Secret**. `OP_CI_TEST_VAULT_ID`
ist eine Environment Variable mit der Vault-ID. Alle folgenden Environment Variables tragen
`op://<vault-id>/<item-id>/[section/]field`-Referenzen, niemals Klartextwerte:

| Referenz-Variable | Verwendungszweck |
|---|---|
| `ZITADEL_ISSUER_REF` | Exakter Test-Issuer; auch Browser-Prüfgrenze |
| `ZITADEL_CLIENT_ID_REF`, `ZITADEL_AUDIENCE_REF` | Registrierter PKCE-Testclient, gleiche Audience |
| `ZITADEL_JWKS_URI_REF` | Signaturprüfung |
| `ZITADEL_AUTHORIZATION_ENDPOINT_REF`, `ZITADEL_TOKEN_ENDPOINT_REF` | Bestehender Authorization-Code-/PKCE-Weg |
| `ZITADEL_USERINFO_ENDPOINT_REF` | Verifizierte eigene Profilangaben |
| `ZITADEL_REDIRECT_URI_REF` | Exakt `http://localhost:4200/auth/callback` |
| `ZITADEL_END_SESSION_ENDPOINT_REF` | Tatsächlich zu durchlaufender Provider-Endpunkt |
| `ZITADEL_POST_LOGOUT_URI_REF` | Exakt `http://localhost:4200/auth/logout/callback` |
| `E2E_REAL_CUSTOMER_LOGIN_REF`, `E2E_REAL_CUSTOMER_PASSWORD_REF`, `E2E_REAL_CUSTOMER_SUBJECT_REF` | Vorhandenes Kundentestkonto |
| `E2E_REAL_GARAGE_LOGIN_REF`, `E2E_REAL_GARAGE_PASSWORD_REF`, `E2E_REAL_GARAGE_SUBJECT_REF` | Vorhandenes Werkstatttestkonto |
| `E2E_REAL_LOGIN_ORIGIN_REF` | Optional abweichender ausdrücklich freigegebener HTTPS-Login-Origin |

Optionale nicht geheime Environment Variables für die konkrete Provider-Oberfläche:
`E2E_REAL_USERNAME_SELECTOR`, `E2E_REAL_PASSWORD_SELECTOR`, `E2E_REAL_SUBMIT_SELECTOR` und
`E2E_REAL_LOGOUT_CONFIRM_SELECTOR`. Letztere nur setzen, wenn die Provider-Version ausdrücklich
einen Bestätigungsschritt benötigt. Kein generischer Klick auf beliebige Provider-Buttons.

Referenzprüfung weist fehlende Felder, Klartext, fremde Vault-IDs und ungültige Referenzen zurück.
Die offizielle `1password/load-secrets-action` (v5.0.1, vollständiger geprüfter Commit-SHA,
CLI 2.38.1) löst erst **nach Installation und Build** auf. `export-env: false`; Token nur im
Resolver-Schritt, Felder nur über dessen Outputs im Testschritt. Keine `configure`-Action mit
jobweitem Token und keine pauschale Weitergabe an nachfolgende Schritte. Maskierung ist ergänzend,
nicht die Sicherheitsgrenze. Nicht auflösbare oder verweigerte Felder lassen den Schritt scheitern.

Rotation: neue dedizierte Read-only-Service-Account-Credentials durch die zuständige Person
bereitstellen, das Environment Secret sicher ersetzen, den alten Account widerrufen und den
verweigerten Altzugriff sowie einen vollständigen neuen Lauf nachweisen. Auch bei Personal-,
Scope- oder Sicherheitsänderungen rotieren/widerrufen; keine Passwörter der Providerkonten,
MFA-Regeln oder Providerregistrierungen ohne gesonderte Freigabe ändern. Keine Tokens oder
persönlichen Freigabelinks in Tickets, PRs oder Terminal-Historie hinterlegen.

### Eigene Runner-Anwendung und geprüfte Abläufe

CI verwendet eine eigene PostGIS-Service-DB als Kontrolldatenbank und daraus eine zufällige
`ak_e2e_*`-Szenariodatenbank. Bestehende Migrationen und Demo-Workflow-Seeds verknüpfen die beiden
tatsächlichen Subjects erst im Speicher/zur Laufzeit mit fiktiven Daten. Kein realer Subject in
Git. Der gebaute SSR-Server startet auf `http://localhost:4200`, damit **beide schon registrierten
Callbacks** passen. Kein Tunnel, Deployment oder Zugriff auf die Nutzer-App/-DB. Fehlende
Registrierungen sind Blocker, keine Aufforderung zur Provideränderung.

Prozessweitergabe erfolgt über Allowlisten: Migration nur lokale DB; Seed nur Test-Issuer und
zwei Subjects; App nur benötigte OIDC-Konfiguration und lokale DB; Browser-Test nur Testzugänge
und freigegebene Browser-Konfiguration. Weder der App-Prozess noch Chromium erhalten den
1Password-Token. Chromium selbst erbt auch nicht die Testpasswörter; der Playwright-Prozess
verwendet sie ausschließlich zur regulären Formulareingabe. Keine lokalen `.env`-Dateien oder
bestehenden Browsersitzungen werden übernommen. Keine Passwort-Grant- oder Sitzungsinjektion.

Beide Konten prüfen Login/Einstieg, tatsächlich gelieferte Profilfelder sowie Kontotyp, Rollen
und Memberships getrennt. Zusätzliche UUID-markierte Anfrage/Werkstatt durchlaufen gemeinsame
CRUD-Hilfen: Bearbeiten/Reload, Anfrage-Aktivierung, Entwurfsstatus und bestätigte Löschung samt
Abwesenheit aus Verwaltung/öffentlicher Suche. Fremde direkte GET-/PUT-/PATCH-/DELETE-Anfragen
müssen verweigert werden und greifen ausschließlich die zusätzlichen Testobjekte an. Der
anschließende Kontowechsel verwendet denselben Browserkontext **ohne Cookie-/Storage-Reset**.

Vollständiger Logout muss Navigation zum konfigurierten End-Session-Endpunkt, die Rückkehr über
`/auth/logout/callback` und danach eine unauthentifizierte App zeigen. Ein lokaler Status 401
allein gilt nicht als Erfolg. Provider-Version, Login-/Logout-Bestätigung und MFA sind erst durch
einen echten Lauf bestätigt; kein synthetischer Test bescheinigt sie.

Cleanup prüft die vom eigenen Lauf beobachteten IDs und UUID-Markierungen. Bestehende Kontodaten
bleiben unverändert. Auch Fehlerpfade schließen Browser/Prozesse und entfernen ausschließlich
die eigene Szenariodatenbank. Cleanupfehler verhindern Erfolg; ein extern beendeter Runner kann
keinen gültigen erfolgreichen Abschluss nachweisen.

### Commands und Nachweisdatei

```sh
# Bestehende, ausdrücklich freigegebene lokale Test-App: Werte aus dem freigegebenen Store im Prozess.
AUTOKOSOVA_E2E_REAL=1 npm run test:e2e:real

# Runner-Modus nach secretfreiem npm ci / Chromium-Installation / npm run build:
# Erfordert zusätzlich eigene AUTOKOSOVA_E2E_DATABASE_URL und vollständige ZITADEL-Konfiguration.
AUTOKOSOVA_E2E_REAL=1 E2E_REAL_ISOLATED=1 npm run test:e2e:real

npm run typecheck:e2e
npm run test:e2e:policy
npm run test:e2e
```

Lokaler Modus verlangt `E2E_REAL_BASE_URL`, `E2E_REAL_ISSUER`,
`E2E_REAL_END_SESSION_ENDPOINT` und jeweils `E2E_REAL_<CUSTOMER|GARAGE>_<LOGIN|PASSWORD|SUBJECT>`.
Die oben beschriebenen optionalen Login-/Selektorvariablen gelten auch lokal.
`E2E_REAL_HEADED=1` ist nur lokale Diagnose mit regulärer menschlicher MFA-Interaktion,
kein CI-Ersatz. In CI sind eigene App/DB und exakter Checkout-SHA verpflichtend; Filter sind
nicht erlaubt. Ohne vollständige Konfiguration: **Exit 2 / NOT RUN**, nicht Erfolg.

`test-results/e2e-real/summary.json` enthält ausschließlich Modus, Commit, Lauf-ID/-Versuch,
zufällige Nonce, die festen Kontotypen/Prüfschritte sowie Status/Cleanup. Der übergeordnete Starter
verwirft alte Ergebnisse und prüft den frischen vollständigen Bericht **zusätzlich** zum
Browser-Exitcode. Kein erfolgreiches Teilinventar, Retry-Ergebnis oder fehlender Login kann passen.
Nur diese Datei wird für sieben Tage hochgeladen; keine Passwörter, Subjects, Providerbilder,
Cookies, Auth-State, Traces, Videos, Netzwerkdumps oder rohen Browser-/Appfehler.

Erforderliche Repositoryregeln müssen `e2e-acceptance` **und** `e2e-zitadel` auf aktueller
Main-Basis verlangen. Die Implementierung eines Workflows ist keine eingerichtete Merge-Sperre.
Solange Environment/Vault/automatische Vertrauensprüfung oder die echten PR-/Main-Läufe fehlen, bleibt
#119 offen und Teil-PRs verwenden nur `Refs #119`. Keine zusätzliche manuelle Funktionsabnahme,
kein Schließungsbot; die administrative Sicherheitsfreigabe ersetzt keine automatisierten Tests.

Quellen (am 16.09.2026 geprüft): [1Password GitHub Action](https://developer.1password.com/docs/ci-cd/github-actions/),
[Service-Account-Grenzen](https://developer.1password.com/docs/service-accounts/get-started/),
[GitHub Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
Die Action-Version wurde zusätzlich am veröffentlichten v5.0.1-Commit und dessen `action.yml` geprüft.

## Übernommene und weiterhin spezialisierte Tests

Die fachlichen Kunden-/Werkstattabläufe der früheren `demo-accounts-browser-smoke.mjs` und
`inquiries-db-browser-smoke.mjs` werden durch diese Suite ersetzt. Die handgeschriebenen
CDP-Hilfen bleiben nur dort, wo noch spezialisierte Tests davon abhängen (Account-, Favoriten-,
Footer-, OIDC- und gezielt simulierte Layout-/Antworttests). Deren komplette Migration ist nicht
Bestandteil von #112. Historische Prüfprotokolle behalten ihre ursprünglichen Ergebnisse.
