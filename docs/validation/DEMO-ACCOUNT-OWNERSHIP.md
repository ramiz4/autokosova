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

## Noch nicht bestätigt

Die bestehenden ZITADEL-Konten `ak-test-garage-20260913@example.test` und
`ak-test-customer-20260913@example.test` wurden **nicht** als tatsächlich verbunden
oder erfolgreich angemeldet bestätigt. Das Lesen des freigegebenen 1Password-Eintrags
scheiterte an einer Autorisierungs-Zeitüberschreitung; in der bestehenden lokalen
Projektkonfiguration waren keine Demo-Subject-Schlüssel vorhanden. Es wurden weder
Subjects geraten noch E-Mail-basierte Rechte oder ein Login-Bypass eingebaut.

Nach Freigabe des Secret-Store-Zugriffs bleiben die tatsächlichen Subjects lokal zu
konfigurieren und der abschließende Login-Test mit beiden bestehenden Konten auszuführen.
Ein Merge, ein produktives Deployment und eine Änderung der Provider-Konfiguration
wurden nicht vorgenommen. Der PR bleibt bis zur offenen Kontoverknüpfung ein Entwurf.
