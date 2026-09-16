# Echte ZITADEL-Abnahme – Issue #119

## Aktuelle Korrektur – Automation ohne manuelle Approvals (16.09.2026)

Nutzerauftrag: keine manuellen CI-Freigaben; fehlgeschlagenen Lauf beheben. Die ältere
Reviewer-Einrichtung unten ist damit historisch, nicht mehr die aktuelle Ausführungspolitik.
Das Environment wurde erneut gelesen: kein Required Reviewer/Wait Timer, nur `main` und
`refs/pull/*/merge`, kein Admin-Bypass. Zehn strikte Required Checks gelten weiterhin.
Beide tatsächlich vorhandenen Repository-Writer (`ramiz4`, `ramizloki`) sind explizit vertraut;
Workflow-Actor, erneuter Actor, PR-Autor, aktuelle Schreibrechte und aktueller Merge-SHA werden
automatisch geprüft. Diese Grenze ist keine unabhängige Personenprüfung.

Lauf 35066961477 wurde regulär als `ramiz4` freigegeben; Installation, Build und tatsächliche
1Password-Laufzeitauflösung waren erfolgreich. Der nachfolgende Runner scheiterte. Gefunden:
Der Standalone-TypeScript-Einstieg enthielt Top-Level-await, obwohl tsx ihn in diesem Projekt
als CommonJS lädt. Die synthetischen Tests importierten nur Hilfen und erkannten das nicht.
Der Einstieg verwendet jetzt eine explizite asynchrone Hauptfunktion; ein echter, secretfreier
Subprozesstest prüft den Loader und den sicheren Preflight. Fehlerberichte werden nur nach
strikter Feld-/Wert-Allowlist übernommen, damit der konkrete fehlgeschlagene Schritt erhalten
bleibt, ohne rohe Browserfehler, Credentials oder URLs zu protokollieren.

Aktuelle echte Vor-/Nach-Merge-Ergebnisse werden im PR nach Ausführung an SHA und Lauf gebunden;
dieser Korrekturstand allein behauptet noch keine bestandenen ZITADEL-Logins.

## Historische Einrichtungs- und Prüfnachweise

## Fortsetzung nach ausdrücklicher Adminfreigabe am 16.09.2026

Der Nutzer hat die Ausführung mit `gh auth switch --user ramiz4` und die anschließende Rückkehr
zu `ramizloki` ausdrücklich beauftragt. Der Adminzugang wurde tatsächlich verifiziert.
`e2e-zitadel` ist eingerichtet: Required Reviewer `ramiz4`, `prevent_self_review=true`,
`can_admins_bypass=false`. `main` verlangt aktuelle Basis sowie zehn GitHub-Actions-Checks:
`verify`, `development-start`, `e2e-acceptance`, `e2e-zitadel`, `account-browser`,
`favorites-db-browser`, `inquiries-browser`, `footer-browser`, `oidc-logout-browser`,
`staff-browser`. Diese Schutzregeln gelten auch für Administratoren; kein Force-Push/Branch-Löschen.

Ein eigener 1Password-Vault enthält genau drei Einträge: die erforderlichen Felder der beiden
bereits freigegebenen Testkonten und die benötigte Test-OIDC-Konfiguration. Kein Admin-/Produktiv-
Credential wurde übernommen. Die vorhandene lokale Testkonfiguration wurde feldweise übernommen
und gegen die öffentliche Discovery geprüft; Nutzer-App/-DB und Providerregistrierung bleiben
unverändert. Der CI-Service-Account hat ausschließlich `read_items` für diesen einen Vault,
keine Schreib-/Share-/Vault-Erstellungsrechte. Tatsächlich geprüft: nur dieser Vault sichtbar,
alle vorgesehenen Felder lesbar, fehlendes Feld verweigert, Zugriff auf den privaten Vault
verweigert, Schreibversuch verweigert. Das Environment enthält nur 17 `op://`-Feldreferenzen,
die Vault-ID und den Token als Environment Secret, keine Klartext-Credentials als Variables.

Betriebsverantwortung: Ramiz Loki (`ramiz4` für Administration). Service-Account-Laufzeit 90 Tage;
Rotation spätestens 01.12.2026, Widerruf über 1Password Developer / Service accounts. Der Token-
Wiederherstellungseintrag liegt außerhalb des CI-Vaults. Die administrative Freigabe dieses
Auftrags ist nutzerautorisiert; zwei eigene GitHub-Accounts sind kein Nachweis einer zweiten
unabhängigen Person. Die Environment-Regeln werden unverändert regulär durchlaufen.

Die bisher extern fehlende Einrichtung ist damit hergestellt. Die tatsächlichen echten
PR-/Main-Ergebnisse werden separat an die überprüften Commits/Läufe gebunden; diese Einrichtung
allein erklärt weiterhin keine echte Anmeldung oder das Issue für bestanden.

## Historischer Zwischenstand vor der Adminfreigabe am 16.09.2026

**IMPLEMENTIERUNG / EXTERN BLOCKIERT – keine bestandene echte Gesamtabnahme, kein Issue-Abschluss.**
Ausgangsstand: `e5404b7` auf `origin/main`; eigener Branch `feat/119-zitadel-ci` und isolierter
Worktree. Nutzer-App, bestehende DBs, Providerkonten/-rollen/-registrierung, Repositorysichtbarkeit
und persönliche/produktive Secrets wurden nicht geändert. Keine Administrationszugänge aus
1Password verarbeitet und kein breiter persönlicher Vault für CI freigegeben.

## Neu verifizierte Voraussetzungen

| Voraussetzung | Tatsächlicher Befund |
|---|---|
| Repository | `ramiz4/autokosova`, Hauptbranch `main`; API meldet inzwischen `private: false`. Die frühere Plan-/Sichtbarkeitseinschränkung aus #112 ist nicht unverändert als aktueller Blocker übernommen. |
| Verfügbarer GitHub-Zugang | `push: true`, `admin: false`, `maintain: false`. Keine administrativen Schutzregeln oder Credentials über einen anderen Zugang umgangen. |
| Environments | API-Liste erfolgreich lesbar, aber leer. `e2e-zitadel` samt unabhängigen Reviewern/kein Bypass ist nicht eingerichtet. |
| Variables/Secrets | Repository-Listen leer; mangels Environment auch kein bereitgestellter Environment-Token/Referenzsatz nachgewiesen. |
| Rulesets | API-Liste lesbar, aber leer. Keine technisch eingerichtete Required-Check-Merge-Sperre behauptet. |
| 1Password | CLI vorhanden; Vault-Metadaten lesbar. Kein dedizierter AutoKosova-CI-Test-Vault in der sichtbaren Liste; passender ausschließlich lesender Service-Account und verantwortliche Person nicht nachgewiesen. |
| ZITADEL | Dokumentierte Testcallbacks auf localhost:4200 übernommen; reale Registrierung, Kontozugänge, Login-Oberfläche/MFA und Logout-Bestätigung in diesem Auftrag noch nicht live bestätigt. Keine Provideränderung. |

## Implementierter Umfang

Separater fail-closed Workflow mit drei kleinen Jobs: secretfreie Vertrauensprüfung,
unabhängig freizugebende Integration und zusammenfassender Check ohne grünen Skip.
Verifizierte vollständige Action-SHAs; aufgelöste Werte erst nach Installation/Build und nur
im Laufzeitschritt, danach Allowlisten pro Kindprozess. Keine Connect-/Preview-Infrastruktur.

Vorhandener `test:e2e:real`-Einstieg und CRUD-Hilfen weiterverwendet. Hinzu kommen eine eigene
gebaute App und zufällige PostGIS-Testdatenbank, Laufzeit-Subject-Zuordnung mit vorhandenen Seeds,
Profil-/Membershipprüfungen, zusätzliche Anfrage/Werkstatt mit Aktivierung/Reload/Löschung,
fremde Objektzugriffe und tatsächlich beobachtete End-Session-/Callback-Navigation.
Kontowechsel verwendet denselben Browserkontext ohne Storage-/Cookie-Reset.

Reduzierter Ergebnisvertrag mit Commit, Lauf/Versuch, Nonce, festen Kontotypen und Prüfschritten;
unabhängige Prüfung durch den Starter. Cleanupfehler, veraltete Ergebnisse, fehlende Schritte
oder nicht ausgeführte Logins können keine erfolgreiche Abnahme ergeben.

## Prüfprotokoll

Lokal am 16.09.2026 auf dem Implementierungsworktree tatsächlich erfolgreich:

| Prüfung | Ergebnis |
|---|---|
| `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e` | Erfolgreich |
| `actionlint .github/workflows/e2e-zitadel.yml`, `git diff --check` | Erfolgreich |
| `npm run test:dev` mit npm 11.19.0 | 20/20, keine Skips |
| `npm test` | 341/341 Angular-Tests |
| `npm run test:e2e:policy` | 21/21, einschließlich echtem Exit-2-/Stale-Report-Prozesstest |
| `npm run test:e2e` | 28/28 Desktop-/Mobilfälle, vollständiges Inventar, keine Retries/Skips; Bericht durch Starter geprüft |
| `npm run test:server` gegen eigene migrierte PostGIS-DB | 124 erfolgreich; zwei profilgebundene Tests anschließend separat ausgeführt |
| `npm run test:demo-seed`, `npm run test:demo-workflow-seed` | Beide mit eigenem passenden Seed erfolgreich |
| `npm run build`, `npm run test:smoke` | Build erfolgreich; 45 lokalisierte SSR-Seiten geprüft |

Die Tests des realen Runners mit signierendem Testprovider sind **synthetische Regressionen**,
keine echte ZITADEL-Abnahme. Insbesondere bestand die Negativprüfung, dass lokaler Logout/401
und App-Rückkehr ohne den geforderten End-Session-Besuch nicht genügen. Die Lifecycle-Prüfung
belegte den Start der eigenen gebauten App, Laufzeit-Subject-Zuordnung, Löschung nur der eigenen
Testdatenbank und Erhalt der Kontrolldatenbank.

Lokale Diagnosegrenzen: Die global installierte npm-Version 11.12.1 unterstützt die
Installationsskript-Regeln nicht vollständig; der erste Starter-Testlauf erkannte dies korrekt.
Nach Ausführung mit der dokumentierten npm-Version 11.19.0 bestanden alle Starter-Tests.
Die erschöpften Docker-Standard-Subnetzbereiche verhinderten zunächst den üblichen Compose-
Teststart. Statt fremde Netzwerke/Volumes zu löschen, wurde eine eigene kurzlebige PostGIS-DB
auf der vorhandenen Bridge mit zufälligem Loopback-Port verwendet; beim direkten DB-Test wurde
auf den endgültigen TCP-Listener gewartet. Die eigenen Container wurden danach gestoppt/entfernt.
Ein anfänglicher CLI-/Modulimport-Konflikt im neuen Test wurde vor dem erfolgreichen 28-Fälle-Lauf
korrigiert. Die vorhandene Initial-Bundle-Budgetwarnung bleibt außerhalb dieses E2E-Scopes.

Der lokale Bericht beschreibt den getesteten Arbeitsstand auf Basis `e5404b7`, nicht einen
behaupteten bereits gemergten Commit. CI-Läufe auf dem veröffentlichten PR-Integrationsstand
und dessen Commit sind separat im PR nachvollziehbar.

**Echte Vor-Merge-ZITADEL-Abnahme:** NOT RUN – geschütztes Environment, Referenzen und
freigegebener dedizierter CI-Service-Account fehlen.

**Echte Main-Abnahme:** NOT RUN – kein regulärer Merge nach bestandener echter Vorabnahme.

## Verbleibende Freigabe-/Einrichtungsarbeit

Berechtigte Repositoryadministration muss `e2e-zitadel` mit unabhängigen Reviewern,
verhinderter Selbstfreigabe und deaktiviertem Admin-Bypass sowie beide Required Checks
(`e2e-acceptance`, `e2e-zitadel`) auf aktueller Main-Basis einrichten.

Eine benannte berechtigte 1Password-verantwortliche Person muss den dedizierten reinen
Test-Vault und ausschließlich lesenden CI-Service-Account bereitstellen. Nur die benötigten
Felder der bereits freigegebenen Testzugänge/Testkonfiguration übernehmen; keine Produktiv-
oder Adminfelder. Environment Secret und Referenz-Variables gemäß
[E2E-ACCEPTANCE.md](../development/E2E-ACCEPTANCE.md) setzen; Zuständigkeit, Rotation und Widerruf
verbindlich dokumentieren. Konten, Rollen, MFA und Callbackregistrierung nicht ohne eigene Freigabe ändern.

Erst nach tatsächlicher vollständiger Vor-Merge-Abnahme beider Konten, erfolgreicher
Anwendungs-E2E und regulärem Merge kann #119 abgeschlossen werden. Den nachfolgenden echten
Main-Lauf auf dem tatsächlichen Merge-Commit ausdrücklich prüfen und dokumentieren.
Ein roter/übersprungener Check oder lediglich diese Workflowdateien sind kein Abschlussnachweis.
