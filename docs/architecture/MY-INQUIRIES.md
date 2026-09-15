# Meine Anfragen: private Verwaltung

Issue #71 / PR #73. Der Nutzerauftrag vom 14.09.2026 erweitert die ursprüngliche
Nur-Lesen-Seite ausdrücklich um Bearbeiten, Deaktivieren/Reaktivieren und Löschen.
Die kanonischen Routen bleiben `/inquiries`, `/sq/inquiries`, `/en/inquiries`.
`/inquiry` ist weiterhin ausschließlich die Erstellung; Profil, Rollen, Favoriten und
öffentliche Suche bleiben getrennte Funktionen.

## Oberfläche und Datenquelle

Die Übersicht verwendet den gemeinsamen Header/Footer, kompakte Anfragekarten mit
Leistung, Problemkurztext, optionalem Fahrzeug, Orten und Datum sowie serverseitige
Filter für alle, aktive und deaktivierte Anfragen. Die Aktionen sind Details,
Bearbeiten, Werkstattsuche und ein separates Aktionsmenü. Löschen erfordert einen
nativen Bestätigungsdialog mit vorausgewähltem Abbrechen. Das Bearbeiten öffnet einen
nativen modalen Dialog mit den tatsächlich gespeicherten Angaben, gemeinsamer
Validierung und dem bestehenden Ortseditor. Escape bei ungespeicherten Änderungen
fordert zum Verwerfen auf; Browser-Neuladen und Routennavigation sind abgesichert.
Fehler und Versionskonflikte behalten die eingegebenen Änderungen.

Der Runtime-Server verwendet ausschließlich `PostgresRepairRequestStore` für diese
Daten. Ohne `DATABASE_URL` antwortet `UnavailableRepairRequestStore` mit 503 statt
flüchtige Speicherung als dauerhaft zu bestätigen. `AccessStore` bleibt ein
isolierter Test-Adapter von `createServer`, keine Runtime-Alternative. Es gibt keine
Beispielanfragen oder lokalen Gastentwürfe in der Kontoliste. Nach jedem erfolgreichen
Schreibvorgang wird die Liste erneut vom Server geladen. Eine Fehlermeldung beim
anschließenden Laden unterscheidet sich von einer fehlgeschlagenen Speicherung.

## Private API

Alle IDs werden gegen die aus der Serversitzung abgeleitete Besitzer-ID geprüft;
fremde IDs ergeben auch für Admins 404. Kein API-Parameter bestimmt den Besitzer.

| Methode / Pfad | Vertrag |
| --- | --- |
| `POST /api/me/repair-requests` | Bestehender Erstellungsvertrag bleibt erhalten. |
| `GET /api/me/repair-requests` | `limit` standardmäßig 20, maximal 50; optional `cursor` und `activity=all\|active\|inactive`. Antwort `{ requests, nextCursor }`. |
| `GET /api/me/repair-requests/:id` | Eigene gespeicherte Details, zusätzlich `active`, `revision`, `updatedAt`; `ETag: "<revision>"`. |
| `PUT /api/me/repair-requests/:id` | Vollständiger vorhandener `RepairRequestInput`; Status bleibt unverändert. |
| `PATCH /api/me/repair-requests/:id` | Ausschließlich `{ active: boolean }`. |
| `DELETE /api/me/repair-requests/:id` | Dauerhafte Entfernung der Anfrage; Erfolg 204. |

Alle Schreibzugriffe erfordern Sitzung und den bestehenden Cookie-/Header-CSRF-Abgleich.
PUT/PATCH/DELETE verlangen zusätzlich `If-Match: "<revision>"`: fehlend 428,
ungültig 400, inzwischen geändert 409. Es gibt kein Überschreiben nach dem Prinzip
„letzte Antwort gewinnt“. Erfolgreiche Änderungen inkrementieren die Revision und
geben die neuen Details zurück. Datenbankfehler geben ausschließlich eine generische
503-Antwort aus; keine privaten SQL-Werte im API-Payload oder App-Log.

Migration 071 indiziert `(owner_user_id, created_at DESC, id DESC)`; Migration 072
ergänzt `active`, `revision`, `updated_at` und den zusätzlichen Aktivitätsindex.
Sortierung und Cursor bleiben auf dem unveränderlichen Speicherdatum und der ID.
PostgreSQL löst den Cursor innerhalb des eigenen Bestands mit voller Zeitpräzision auf.
Aktivitätsfilter gelten in SQL für den gesamten Bestand, nicht nur für bereits geladene
Karten. Alle Listen-/Detail-Reads verwenden einen konsistenten Read-only-Snapshot.

## Transaktionen und Löschgrenze

Änderungen sperren die besitzergebundene Anfragezeile mit `FOR UPDATE`, vergleichen
unter der Sperre die Revision und prüfen die Sitzung erneut nach dem Warten sowie vor
dem Commit. Schlägt die erneute Autorisierung fehl, wird die gesamte Transaktion
zurückgerollt. Fahrzeugangaben verwenden Copy-on-write: das Bearbeiten einer Anfrage
verändert keine andere Anfrage, die denselben älteren Fahrzeugdatensatz referenziert.
Nicht mehr referenzierte eigene Fahrzeug-Snapshots werden entfernt.

Deaktivieren ist reversibel und entfernt keine Angaben. Deaktivierte Anfragen bleiben
in der privaten Übersicht sichtbar; für die erneute Suche müssen sie reaktiviert werden.
`active` ist ein Organisationsmerkmal, kein Versand-, Angebots-, Buchungs- oder Auftragsstatus.
Die ältere interne `state`-Spalte wird nicht zu einem neuen Auftragsworkflow erweitert.

Löschen entfernt die Anfrage, ihre Suchorte und Anhangszuordnungen sowie einen nicht
anderweitig referenzierten eigenen Fahrzeug-Snapshot atomar. **Eigenständige
Dateiobjekte werden nicht physisch gelöscht:** Sie unterliegen weiterhin dem vorhandenen
getrennten Aufbewahrungs-/Löschverfahren. Der Bestätigungsdialog nennt diese Grenze.
Beim Bearbeiten bleiben bestehende Anhangs-IDs unverändert; es werden weder neue
Dateiuploads noch öffentliche Downloadlinks eingeführt.

## Datenschutz und Lebenszyklus

Die Angular-Daten bleiben ausschließlich im seitenspezifischen Service; kein
Local-/SessionStorage für Kontodaten, kein privater SSR-/TransferCache. Identitätswechsel,
Logout, Sitzungsablauf, Browser-Lebenszyklus und Komponentenzerstörung verwerfen die
Daten und brechen laufende Reads/Writes ab. Antworten werden vor und nach dem
asynchronen JSON-Lesen gegen Identität und Generation geprüft. Der separate lokale
Erstellungsentwurf wird weder beim Ansehen noch beim Ändern/Löschen angerührt.

Seite und API: `private, no-store`, `Vary: Cookie`, `noindex, nofollow`, `no-referrer`.
Keine Sitemap-Aufnahme und keine private Analytics-Veranstaltung. Suchlinks verwenden
weiterhin ausschließlich `buildRepairRequestSearchParams`: Leistung und Ortsradien,
keine IDs, Symptome, Fahrzeuge, Anhänge oder Reisedaten.

## Prüfungen und Nachweisarten

Die regulären README-/AGENTS-Prüfungen bleiben unverändert. `test/inquiry-management.test.ts`
prüft den API-Vertrag gegen den Memory-Testadapter und echten PostgreSQL-Store,
inklusive konkurrierender Revisionen, Rollback vor Commit, Besitzertrennung und
unabhängiger SQL-Nachprüfung. Ohne `DATABASE_URL` werden nur die DB-Tests explizit übersprungen.

`node scripts/inquiries-browser-smoke.mjs` prüft die bisherigen Zustände und
Navigation mit isolierten Browserfixtures. **Diese Fixtures sind kein DB-Nachweis.**

`node scripts/inquiries-db-browser-smoke.mjs` benötigt eine migrierte, mit Referenzdaten
versehene lokale Test-DB, Produktionsbuild und Chrome. Der neue CI-Job verwendet einen
eigenen PostGIS-Service. Er führt die echte Formularerstellung sowie Bearbeiten,
Deaktivieren, Reaktivieren, Löschen, Konflikte und Kontowechsel über die unveränderten
privaten HTTP-APIs aus und kontrolliert die Ergebnisse zusätzlich mit unabhängigen
SQL-Abfragen. Es werden **keine Anwendungsantworten abgefangen**. Seine Daten sind
fiktive Testdaten, aber tatsächlich in PostgreSQL gespeichert. Bereinigt werden nur
die zufälligen eigenen Testkonten und deren Daten, niemals ein fremder Bestand.

Die testlokale OIDC-Gegenstelle erzeugt einmalige Codes, kontrolliert PKCE und signiert
JWTs; die Anwendung durchläuft ihren regulären Codeaustausch und ihre kryptografische
Verifikation. **Das ist nicht die freigegebene echte Test-ZITADEL aus #38.** Deren
Durchlauf mit vorhandenen Testkonten bleibt separat auszuführen und im PR zu belegen.
Keine produktive Anbieter-Konfiguration, Geheimnisse oder Runtime-Login-Bypässe.

Screenshots und `verification.json` des DB-Browserjobs liegen unter
`test-results/inquiries-db`; sie decken DE/SQ/EN bei 360/390/430/1280 CSS-Pixeln ab.
Die tatsächlichen Ergebnisse je Commit und nicht ausgeführte Prüfungen stehen im PR.
