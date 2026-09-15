# Demo-Konten und eigene Datensätze (#81)

## Privatkunde und Werkstattbetreiber

`/api/me` liefert den Kontotyp `accountType: customer | garage` zusätzlich zu den
bestehenden Systemrollen. Privatkunden sehen im Kontomenü ihre Anfragen und Favoriten;
Werkstattbetreiber sehen „Meine Werkstätten“. Die Verwaltung bleibt unter
`/garages/new` beziehungsweise `/sq/garages/new` und `/en/garages/new` erreichbar.

Der Kontotyp ist **keine Berechtigung**. Eigene Reparaturanfragen werden weiterhin
über `owner_user_id`, Werkstätten über aktive Memberships autorisiert. Die technische
Basisrolle `customer` bleibt für angemeldete Konten bestehen; Moderator/Admin werden
weiter ausschließlich aus verifizierten OIDC-Rollen abgeleitet. Ein Betreiber kann
weiterhin eigene private Kundenfunktionen benutzen, auch wenn sein Menü die
Werkstattverwaltung priorisiert. Es entsteht kein Zugang zu fremden Kundenanfragen.

Die erste selbst angelegte Werkstatt macht das Konto zum Werkstattbetreiber. Dieser
Kontotyp bleibt nach dem Löschen der letzten Werkstatt erhalten. Bestehende aktive
Memberships werden bei der Migration entsprechend berücksichtigt.

## Tatsächliche Testkonten verknüpfen

Die zwei bestehenden fiktiven Testkonten werden nicht anhand von E-Mail-Profilclaims
berechtigt. Ihre **tatsächlichen OIDC-Subjects (`sub`)** müssen aus dem freigegebenen
1Password-Eintrag in die ignorierte `.env.local` oder Prozessumgebung übernommen werden:

```dotenv
AUTOKOSOVA_DEMO_GARAGE_SUBJECT=<sub des Kontos ak-test-garage-20260913@example.test>
AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT=<sub des Kontos ak-test-customer-20260913@example.test>
```

Diese Zeilen sind Platzhalter, keine funktionsfähigen Subjects. Die vollständige,
bestehende ZITADEL-Konfiguration einschließlich des tatsächlichen `ZITADEL_ISSUER`
muss ebenfalls geladen sein. Keine Passwörter, Tokens oder Anbieter-IDs in Git übernehmen.

Danach im dafür konfigurierten Worktree:

```sh
npm run dev:demo-workflows
```

Die eigenständigen Seed-Befehle behalten ihre lokalen Zielprüfungen und beide expliziten
Demo-Freigaben. Der Standard-Referenzseed und öffentliche Demo-Seed verknüpfen keine Konten.
Ohne beide Subjects bleibt der Workflowseed für rein technische Fixtures nutzbar;
der Start meldet, dass die interaktiven Konten noch nicht zugeordnet sind.

| Testkonto | Zugeordnete bestehende Fixtures | Verwaltung |
|---|---|---|
| `ak-test-garage-20260913@example.test` | `demo-prishtina-bremsen`, `demo-prizren-klima-toyota` | Werkstätten anzeigen, bearbeiten, neu anlegen, löschen |
| `ak-test-customer-20260913@example.test` | `demo-request-prishtina-bremsen`, `demo-request-prizren-klima` | Eigene Anfragen anzeigen, bearbeiten, neu anlegen, löschen |

Der dritte technische Demo-Requester bleibt bewusst fremd und ist für negative
Besitztests verwendbar. Es gibt keinen Login-Bypass oder automatisch erzeugte Sitzung.

## Wiederholte Starts und Datenbesitz

Die Zuordnung erfolgt transaktional mit Provenienzprüfung und dokumentiertem Issuer.
Eine bereits gebundene Datenbank wird nicht stillschweigend einem anderen Subject oder
Issuer zugeordnet. Suspendierte Nutzer werden nicht reaktiviert. Bereits anderweitig
zugeordnete oder widerrufene Werkstatt-Mitgliedschaften blockieren die erste Zuordnung.

Nach der erstmaligen Bindung verändern die Demo-Seeds diese zwei Werkstätten und zwei
Anfragen nicht mehr. Änderungen, entfernte Leistungen, widerrufene Mitgliedschaften
und gelöschte Datensätze bleiben bei wiederholtem `dev:demo-workflows` und `dev:demo`
erhalten. Auch ein tatsächlicher Löschvorgang einer Anfrage hinterlässt nur einen
lokalen Provenienzmarker, sodass kein späterer Seed die Anfrage wiederherstellt.
Andere, nicht zugewiesene öffentliche Demo-Fixtures behalten ihr bisheriges Seedverhalten.

Die Bereitschaftsprüfung des Starters verwendet deshalb die nicht zugewiesene
`demo-prishtina-bremsen-offen`. Änderungen der Adresse oder Löschungen einer eigenen
Demo-Werkstatt dürfen den Entwicklungsstart nicht von deren Suchsichtbarkeit abhängig
machen. Die Prüfung verlangt weiterhin eine erfolgreiche DB-gestützte Suchantwort
und die richtige lokale App-Instanz; ein bloßes HTTP 200 reicht nicht.

Ein expliziter geschützter lokaler Reset kann die Fixtures neu aufbauen; er ist kein
Teil des normalen Starts und darf nicht zum vermeintlichen Beheben von Authfehlern
verwendet werden. Eine separate Worktree-Datenbank ist der sichere Weg für andere Testsubjects.

## Werkstatt löschen

`DELETE /api/garages/:garageId` verlangt eine gültige Sitzung, CSRF und eine aktive
**Owner**-Mitgliedschaft. Ein Editor, fremdes Konto oder Admin ohne eigene Owner-
Mitgliedschaft darf nicht löschen. Die Oberfläche zeigt die Aktion nur beim Eigentümer
und verlangt eine Bestätigung mit dem betroffenen Werkstattnamen.

Die Aktion setzt `deleted_at` und nimmt das Profil aus der Veröffentlichung. Das
Profil verschwindet aus Suche, eigener Verwaltung und aktiver Membership-Anzeige.
Es kann nicht mehr über die normale Bearbeitungs-API geändert werden. Eine neue
Werkstatt darf anschließend auch mit demselben Namen angelegt werden.

Dies ist keine physische Löschung aller zugehörigen Daten: unabhängig verfasste
Bewertungen, Nachweise und Auditdaten bleiben für die bestehenden Moderations- und
Aufbewahrungsprozesse erhalten. Die Bestätigung benennt diese Grenze ausdrücklich.

## Prüfung

`test/garage-ownership.test.ts` prüft Konfiguration, Kontotyp, mehrere eigene Betriebe,
Neuanlage, Bearbeitung, Löschung sowie verweigerte Fremd-/Editor-/Admin-/CSRF-Zugriffe.
`test/demo-account-ownership-postgres.test.ts` verwendet ein zufälliges isoliertes
Schema in einer explizit lokalen Testdatenbank und entfernt nur dieses Schema wieder.
Es prüft beide CRUD-Abläufe, transaktionalen Konfliktabbruch, Identitätsbindung,
öffentliche Sichtbarkeit sowie Erhalt von Änderungen und Löschungen nach mehreren Seeds.
Die vorhandenen Anfrage-Revisionstests bleiben unverändert fachlich maßgeblich.

Diese synthetischen Tests ersetzen nicht den Login mit den zwei bestehenden
ZITADEL-Testkonten. Der Stand der tatsächlichen lokalen Zuordnung und der noch
offenen manuellen Login-Abnahme steht in
[`docs/validation/DEMO-ACCOUNT-OWNERSHIP.md`](../validation/DEMO-ACCOUNT-OWNERSHIP.md).

## Übersicht statt dauerhaft geöffnetem Formular (#88)

Angemeldete Werkstattbetreiber starten in der Übersicht ihrer eigenen Betriebe.
„Bearbeiten“ lädt genau das ausgewählte Profil; „Neue Werkstatt anlegen“ öffnet
dasselbe vorhandene Formular mit leeren Feldern. „Zur Übersicht“ schützt ungespeicherte
Änderungen durch die vorhandene Bestätigung. Laden, Ladefehler und eine tatsächlich
leere Liste werden getrennt angezeigt. Öffentliche Profillinks erscheinen ausschließlich
für veröffentlichte Betriebe. Der öffentliche Registrierungseinstieg behält seine
Erläuterungen; die tägliche Verwaltung zeigt keinen Werbekopf und keine Werbespalte.

Regression: `garage-overview.component.spec.ts`, bestehende Navigations-/CRUD-Tests
und `scripts/demo-accounts-browser-smoke.mjs` (signierter synthetischer OIDC-Provider,
eigene PostgreSQL-Fixtures, DE/SQ/EN, 390/1280 px). Der echte Testkonto-Login bleibt
als gesonderter Nachweis in #81/#92 offen.
