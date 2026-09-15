# Aktuelle Abnahmegrenze: #112

Seit der Nutzerentscheidung vom 15.09.2026 ist #92 durch #112 ersetzt. Die funktionale Abnahme
wird durch die vollständige Playwright-Pflichtsuite erbracht; eine weitere manuelle Bedienabnahme
ist keine Abschlussvoraussetzung. Einrichtung, Prüfumfang und Einschränkungen stehen in
`docs/development/E2E-ACCEPTANCE.md`. Ein echter ZITADEL-Durchlauf bleibt separat ausweisbar.

## Implementierungsnachweis für #112 — 15.09.2026

Geprüft im eigenen Worktree `autokosova-112-e2e`, integriert mit `main` auf Basis
`7a0f364` (einschließlich des neuen Anfrage-Aktionsmenüs aus #114/#115).
Lokale Referenzlaufzeit: Node 24.21.0, npm 11.19.0, Playwright Test 1.63.0.

| Prüfung | Tatsächliches Ergebnis |
|---|---|
| Vollständiger `npm run test:e2e`-Einstieg | 16/16 Pflichtfälle erfolgreich, 1 Worker, 0 Wiederholungen, 0 übersprungene Fälle; einschließlich Build, eigenem DB-Start/-Stop und Prozessneustart |
| `npm run test:e2e:policy` | 15/15 erfolgreich; echte positive und negative Playwright-Subprozesse prüfen den Exitcode einschließlich Skip, Only, leerem Lauf, fehlendem Inventar und fehlgeschlagener Berichtserstellung |
| `npm run verify` | vollständig erfolgreich: Format/Lint/Typecheck, 20 Startertests, 316 Angular-Tests in 26 Dateien, 113 erfolgreiche Server-/DB-Tests; 2 explizite Profiltests in dieser Suite übersprungen |
| Explizite öffentliche Demo-/Workflow-Profiltests | jeweils separat mit dem passenden fiktiven Profil und den dokumentierten Freigabevariablen erfolgreich |
| E2E-Typprüfung | erfolgreich |
| Build und SSR-Smoke | erfolgreich; 45 lokalisierte Seiten; bestehende Initial-Bundle-Budgetwarnung bleibt |
| Menü/Sprachen/Layout | DE/SQ/EN bei 360/390/430/1280 px; native Playwright-Klicks und Tastatur, Kontrast und Fokus; mobile Werkstattübersicht und albanischer Anfrageeditor zusätzlich visuell geprüft |
| Echter ZITADEL-Modus | ohne Freigabe/Konfiguration mit Exit 2 / NOT RUN beendet, ohne Browser-/Providerkontakt; kein bestandener echter Login behauptet |

Der erste Lauf nach Übernahme von #115 zeigte eine fehlende Synchronisierung im neuen Tastaturtest:
Die Pfeiltaste wurde vor der vorgesehenen initialen Fokussetzung betätigt. Der Test wartet nun
explizit auf den fokussierten ersten Menüeintrag; keine Assertion wurde entfernt. Danach bestand
die komplette Suite in einem Lauf. Der unabhängige Starter validiert zusätzlich zum Prozessende
den aktuellen, vollständigen Ergebnisbericht einschließlich Commit und Lauf-Nonce.

Die derzeit fehlenden Administrationsrechte beziehungsweise Planvoraussetzungen verhindern
weiterhin eine serverseitig erzwungene Merge-Sperre. Die negativen Test-Runner-Prüfungen belegen
die fail-closed CI-Logik, **nicht** eine eingerichtete GitHub-Branch-Protection. Der endgültige
PR-Integrationslauf und der anschließende Lauf auf dem Merge-Commit werden im Implementierungs-PR
mit ihren tatsächlichen Ergebnissen verlinkt. Keine manuelle funktionale Pflichtabnahme.

Die nachfolgende Dokumentation hält die damaligen Befunde und tatsächlichen Ergebnisse fest.
Ihre frühere manuelle Abschlussbedingung gilt nicht mehr als Gate für #112.

---

# Abnahme der vereinfachten Kunden- und Werkstattabläufe (#92)

Stand: 15.09.2026. Geprüft im isolierten Worktree `autokosova-ux-sequential`,
Ausgangscommit `78cace8` nach PR #103. Die Änderungen aus #87–#91 sind einzeln
über PR #93, #96, #97, #98 und #103 gemergt. Jeder dieser PRs hatte vor seinem Merge
neun erfolgreiche GitHub-Checks. Der reale Testkonto-Login ist weiterhin eine
gesonderte offene Abnahme; dieser Bericht behauptet keinen entsprechenden Erfolg.

## Umgebung und Nachweisgrenzen

Node 26.0.0/npm 11.12.1 lokal, Chromium und eine eigene PostgreSQL/PostGIS-Worktree-DB.
Die Browser-Authentifizierung in den automatisierten Prüfungen erfolgt über einen
isolierten signierenden OIDC-Testprovider mit regulärem Code/PKCE-Austausch. Es gibt
keinen Anwendungs-Login-Bypass. Synthetische Testdaten und eigene zufällige Schemas
werden verwendet; die bestehende reale Demo-Konto-Zuordnung wird nicht verändert.

Ein erfolgreicher synthetischer OIDC-Durchlauf beweist nicht die Anmeldung an der
externen ZITADEL-Testinstanz. Aus einem geschlossenen Vorgängerissue wird ebenfalls
kein nicht dokumentierter erfolgreicher Login abgeleitet. Die vorhandene tatsächliche
Subject-Zuordnung ist in PR #84 dokumentiert; Subjects und Zugangsdaten gehören nicht
in dieses Protokoll.

## Tatsächlich ausgeführte Prüfungen

| Bereich | Nachweis |
|---|---|
| Allgemeiner Login | Beide Kontotypen in DE/SQ/EN mit signiertem Test-OIDC erreichen ihre vorhandenen Bereiche; explizites Rücksprungziel hat Vorrang. |
| Werkstattübersicht | Keine dauerhafte Formular-/Werbedarstellung, gezielte Auswahl, eigener Bestand, Neuanlage-Einstieg und nur zulässige öffentliche Links. |
| Werkstattbearbeitung | API-/DB-CRUD, UI-Bearbeiten/Löschen, bestätigtes Verwerfen, Reload/Reseed und getrennte Status-/Standortinformationen. Neuanlage ist auf API-/DB-Ebene geprüft; die neue Oberfläche wird zusätzlich bis zum leeren Formular geprüft. |
| Kontoseite | Keine funktionslose Glocke; technische Details nativ per Tastatur auf-/zuklappbar. Account-Browser für 15 Kombinationen aus DE/SQ/EN und 360/390/430/1280/1448 px. |
| Status und Fehler | Alle fünf Veröffentlichungszustände; tatsächlicher Status nach bestätigter Mutation, unbekannter Status bei Readback-Fehler; 401, Berechtigungs-403, CSRF-403, Konflikt und allgemeiner Fehler ohne erfundenen Erfolg. |
| Anfragen | Bestehender DB-Browserlauf einschließlich tatsächlicher Formular-Neuanlage, Bearbeiten, Reload, Aktivitätswechsel/Löschen und fremden Zugriffen erfolgreich. |
| Sicherheitsgrenzen | Server-Ownership, Editor-/Owner-Grenzen, Revision/CSRF und signierter Logout-Browserlauf erfolgreich. Zwei zusätzliche Regressionen für zurückbleibende Werkstattdaten wurden zuerst reproduziert, dann korrigiert. |
| Automatisierte Suite | 229 Angular-Tests in 24 Dateien und 107 Server-/DB-Tests erfolgreich; zwei profilgebundene Servertests standardmäßig übersprungen. Format/Lint/Typecheck, Build und Smoke auf 45 lokalisierten SSR-Seiten erfolgreich. |

Der erweiterte Demo-Account-Browser und die zusätzlichen Läufe
`inquiries-db-browser-smoke.mjs`, `account-browser-smoke.mjs` und
`oidc-logout-browser-smoke.mjs` wurden tatsächlich ausgeführt und bestanden.
Vorhandene Bundle-Warnung und lokaler npm-Installationsrichtlinien-Unterschied bleiben
getrennt dokumentiert; die Sicherheitsrichtlinie wurde nicht abgeschwächt. Finalen
CI-Stand und geprüfte Head-SHA enthält der zugehörige PR.

## Bei der Abnahme reproduzierter und behobener Befund

Priorität P1: Im geöffneten Werkstatteditor konnten nach einer bestätigten lokalen
Abmeldung bereits geladene private Profildaten noch angezeigt werden. Ebenso konnte
eine ausstehende Profilantwort nach einem Kontowechsel den vorherigen Betrieb erneut
in den Editor schreiben. Die beiden neu hinzugefügten Tests schlugen auf `78cace8`
reproduzierbar fehl; die übrigen 227 Angular-Tests bestanden.

Korrektur: Die private Werkstattansicht ist an das geladene Konto gebunden. Während
einer vorübergehenden Konto-Neuladung bleibt sie verborgen; bei bestätigtem Logout
oder Wechsel zu einem anderen Konto werden Formular und private Liste verworfen.
Antworten eines älteren Kontokontexts dürfen keine Daten oder Schreibzustände in
den neuen Kontext übernehmen. Nicht bestätigte Konto-Ladefehler werden nicht als
falscher Kontowechsel behandelt; das vorhandene Formular bleibt in diesem Fall nur
im Speicher und verborgen. Beim Verlassen der Komponente werden die lokalen Daten
verworfen und ausstehende Operationen ungültig.

Keine Änderung der serverseitigen Objektberechtigung, keine zusätzliche Rolle, keine
Datenbankmigration und keine Persistierung privater Formularwerte im Browserstorage.
Die großen Template-Diffanteile entstehen durch Einrücken in den Sichtbarkeitsblock.

## Noch offene tatsächliche Abnahme

Die zuvor vom Werkzeug blockierte Passworteingabe an der realen ZITADEL-Instanz wird
nicht über einen anderen Ausführungspfad umgangen. Für den Abschluss von #92 muss
mit beiden vorhandenen echten Testkonten regulär angemeldet und der Ablauf bestätigt
werden: eigener Bestand, zusätzliche fiktive Neuanlage, Bearbeiten, Reload, Löschen,
Logout/Kontowechsel und Datenerhalt nach einem normalen Demo-Neustart. Bestehende
Datensätze dabei nicht zurücksetzen oder als Löschtest verwenden.

Ebenso offen ist die Beobachtung, ob ein tatsächlicher Benutzer die Abläufe ohne
Erklärung versteht. Visuelle Kontrolle und automatisierte Bedienung sind kein
Nutzerinterview und keine gemessene Erfolgsquote. Es wurden keine solchen Ergebnisse
erfunden. #92 bleibt bis zu diesen Nachweisen offen; der technische Befund kann mit
seinem geprüften Fix unabhängig davon gemergt werden.

## Abschließender integrierter Stand

Der parallel gemergte PR #104 (`a76df2c`, stabile Kontorevalidierung) wurde ohne
Konflikte integriert. Eine weiterhin bestätigte Sitzung behält damit die ruhige
Navbar und Kontodarstellung. Der Werkstattschutz greift, sobald der gemeinsame
Kontozustand neutral wird oder ein anderes Konto/Logout bestätigt ist; er ersetzt
nicht die zentrale Sitzungsauflösung.

Danach erneut ausgeführt: **249 Angular-Tests** in 24 Dateien erfolgreich,
107 Server-/DB-Tests erfolgreich (zwei profilgebundene Tests standardmäßig übersprungen),
Format/Lint/Typecheck, Build, 45-Seiten-Smoke und signierter Demo-Account-Browser
jeweils erfolgreich. Der aktualisierte Account-Browser mit stabiler Revalidierung
bestand nochmals alle 15 Sprach-/Viewportkombinationen. Auch der normale schnelle
isolierte Demo-Start mit Ctrl+C, Sperrbereinigung und Diagnose bestand.
Die zusätzlichen Tests aus #104 sind Bestandteil dieser Gesamtzahl, keine hier
neu erfundenen oder doppelt gezählten Nachweise. Die reale Abnahme oben bleibt offen.
