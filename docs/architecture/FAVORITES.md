# Kontogebundene Favoriten

Herzen in der öffentlichen Werkstattsuche speichern Favoriten im angemeldeten Konto. Gäste können weiterhin suchen und Kontakt auswählen; das Herz bietet ihnen die Anmeldung an. Login-Rücksprünge erlauben ausschließlich lokale bekannte Pfade und validierte öffentliche Suchfilter.

## Gemeinsame persönliche Funktion (#102)

Favoriten stehen jedem angemeldeten Benutzer mit gültigem, nicht gesperrtem Konto zur
Verfügung, unabhängig vom Kontozweck `customer`/`garage` und zusätzlichen Rollen.
Kontomenü und Kontoprofil verlinken dieselbe lokalisierte Übersicht ausserhalb der
Unterscheidung zwischen Kunden- und Werkstattbereich. Suche, Profil und direkter
Seitenaufruf verwenden unverändert dieselben sitzungs- und besitzergebundenen Verträge.

Die Liste gehört zur Person, nicht zur Werkstatt: auch zwei Mitglieder desselben
Betriebs haben getrennte Bestände. Weitere Rollen oder Zugehörigkeiten erzeugen keine
zweite Liste; vorhandene Favoriten bleiben erhalten. Admin und Moderator erhalten
keinen Zugriff auf fremde Favoriten. Geschäftsprozess-Berechtigungen ändern sich nicht.

Ein Favorit ist keine Bewertung, öffentliche Empfehlung, Buchung oder Kontaktaufnahme.
Er beeinflusst weder Ranking noch Benachrichtigungen. Es gibt keinen Rollenumschalter,
keine gemeinsame Mitarbeiterliste, Gast-Browserspeicherung oder zusätzliche Migration.

## Vertrag und Berechtigungen

- `GET /api/session` liefert nur den Anmeldestatus, keine Konto-ID.
- `GET /api/me/favorites` liefert eigene `garageIds`.
- `PUT /api/me/favorites/:garageId` speichert idempotent eine veröffentlichte Werkstatt.
- `DELETE /api/me/favorites/:garageId` entfernt idempotent den eigenen Favoriten, auch wenn das Profil inzwischen nicht mehr öffentlich verfügbar ist.

Alle Antworten sind privat und nicht cachebar. Schreibzugriffe benötigen eine echte Sitzung und CSRF-Token. Der Besitzer kommt ausschließlich aus der Sitzung. Migration 019 ergänzt `garage_favorite` mit zusammengesetztem Primärschlüssel, Fremdschlüsseln und Besitzer-RLS. Jede Datenbankoperation setzt `app.user_id` innerhalb derselben Transaktion und begrenzt die Abfrage zusätzlich auf den Besitzer. Favoriten gehören zum privaten Datenexport und werden bei genehmigter Kontolöschung entfernt. Kontolöschung und neue Favoriten serialisieren über die Benutzerzeile; ein gesperrtes Konto wird nicht reaktiviert.

## Oberfläche

Das Herz zeigt den bestätigten Serverzustand, sperrt parallele Änderungen derselben Karte und meldet Fehler ohne falschen Speichererfolg. Die Speicherung verwendet keinen lokalen Browser-Speicher. Vor einem privaten Lesezugriff wird der öffentliche Sitzungsstatus geprüft; parallele Abfragen teilen denselben laufenden Request. Gäste rufen den privaten Favoriten-Endpunkt nicht auf. Toasts verschwinden nach 5 Sekunden, Hinweise zur Anmeldung und Fehler nach 8 Sekunden; erneute Meldungen setzen die Laufzeit zurück.

Ein Neuladen oder eine weitere Sitzung desselben Kontos liest denselben Datenbestand.

Die gemeinsame Navbar liest den echten Sitzungsstatus. Angemeldet erscheint das Konto-Menü statt Login/Registrieren; Abmeldung erfolgt mit CSRF-Schutz. Nicht verfügbare Benachrichtigungen werden nicht als Bedienelement angeboten. Escape und Außenklick schließen die Menüs.

## Lokaler Nachweis

UI- und API-Tests prüfen Authentifizierung, CSRF, Besitzergrenzen, Persistenz, Idempotenz und Fehlerzustände. PostgreSQL-Tests prüfen erneutes Öffnen des Stores sowie Export und Löschung. Auf Port 4200 wurde mit dem fiktiven Customer-OIDC-Testkonto zusätzlich Anmeldung → Herz speichern → API bestätigen → Neuladen → Herz entfernen → Abmeldung geprüft. Demo-Bewertungen stammen ausschließlich aus dem ausdrücklich fiktiven Demo-Seed.

Migration 019 muss vor dem neuen Serverstand angewendet werden. Bei Code-Rücknahme kann die zusätzliche Tabelle bestehen bleiben; sie wird nicht automatisch gelöscht.

## Private Übersicht (#72)

`/favorites`, `/sq/favorites` und `/en/favorites` sind eigene, lazy geladene Seiten.
Der Kontomenü-Link erscheint nur angemeldet und ist von der öffentlichen Suche getrennt.
Header, Footer-Shell, Buttons, Icons und Bewertungssterne verwenden die vorhandenen Bausteine.
Die Übersicht enthält ausschließlich eigene gespeicherte IDs, keine Beispiel-Favoriten und
keine lokalen Gastlisten.

Der unveränderte `GET /api/me/favorites`-Vertrag liefert den kleinen ID-Index. Die Übersicht
löst jeweils **12 IDs** unabhängig von Suchfiltern über `GET /api/public/garages/:id` auf,
mit höchstens **3 parallelen Profilabfragen**. Weitere Profile werden erst nach „Weitere
Favoriten laden“ angefragt. Die vollständigen Profilinhalte aller Favoriten werden weder
vorab noch unbeschränkt parallel geladen. Fehlende Bilder bekommen einen neutralen Ersatz;
Bewertungen werden nur mit gültiger vorhandener Grundlage angezeigt. Entfernungen ohne
Suchbezug werden nicht dargestellt.

404-Profile zeigen weder alte Namen noch Bilder noch Profil-Links, bleiben aber entfernbar.
Andere Fehler sind davon getrennt und pro Karte wiederholbar. Das Entfernen verwendet immer
explizit DELETE, nicht eine Umschaltoperation, und verändert die Liste erst nach erfolgreicher
Antwort. Fehlermeldung und Sperre gehören zum einzelnen Eintrag. Suche, Profil und Übersicht
verwenden jetzt denselben transienten `FavoritesService`; es gibt keine zweite Tabelle oder
Browser-Speicherung. Andere Tabs bekommen nur ein namenloses Änderungssignal und lesen neu.

Eigene Kontodaten werden vor privaten Abfragen über den bestehenden Sitzungsdienst geprüft.
Die öffentliche Profilauflösung sendet keine Sitzungscookies oder Referrer. Bei Logout,
Sitzungsablauf, Kontowechsel und Seitenzerstörung werden private Zuordnungen und ausstehende
Abfragen verworfen. Read- und Write-Antworten werden gegen die konkrete Identität und eine
Generation geprüft, auch nach dem JSON-Lesen. Herzsignale blenden einen alten Bestand schon
synchron aus, bevor die Effektbereinigung läuft.

Bei einer unveränderten Sitzungsprüfung bleiben Favoriten-IDs, aufgelöste Karten und der
bereits geladene Seitenumfang erhalten. Beide Services verwenden den invalidierungssicheren
`dataContext` aus [ACCOUNT-PROFILE.md](ACCOUNT-PROFILE.md), nicht `OwnAccount`-Objektreferenzen.
Ein neuer Anzeigename oder eine aktualisierte Ablaufzeit verursacht keinen neuen ID-Index-
oder Profilabruf. Konto-/Rechtewechsel und Logout blenden alte Zuordnungen dagegen auch vor
der asynchronen Effektbereinigung aus; spätere Antworten dürfen sie nicht wiederherstellen.

Ein ausdrückliches `FavoritesService.load()` (Seiteneinstieg, Retry, Cross-Tab-Änderung)
liest den Serverbestand weiterhin neu und dedupliziert parallele Abrufe. Während einer
solchen Hintergrundaktualisierung bleiben bestätigte Karten statt Skeletons sichtbar.
Tatsächliche Änderungen aktualisieren nur den betroffenen Bestand. Ein durch eine bestätigte
lokale Schreiboperation oder ein weiteres Cross-Tab-Signal überholter Snapshot wird erneut
gelesen, statt eine gerade entfernte Zuordnung wiederherzustellen. Fehler und 401 behalten
ihre bisherigen expliziten Fehler-/Invalidierungszustände. Keine zusätzliche Persistenz.

Die API prüft die Sitzung nach asynchronen Reads erneut; PostgreSQL-Schreibtransaktionen
prüfen sie vor dem Commit und rollen bei abgelaufener Sitzung zurück. Unbekannte
Listenparameter werden abgewiesen. Unerwartete Storage-Fehler geben keine DB-Werte aus.
Ohne `DATABASE_URL` ist der Runtime-Favoritenadapter ausdrücklich nicht verfügbar (503),
statt flüchtige Daten als dauerhaft gespeicherte Favoriten auszugeben. `AccessStore` bleibt
für isolierte Tests verfügbar. Bestehende RLS-, Export- und Kontolöschregeln bleiben erhalten.

Die Favoritenseite ist `private, no-store`, `Vary: Cookie`, `noindex, nofollow` und
`no-referrer`. SSR liefert nur eine neutrale Hülle; es gibt keinen privaten TransferCache,
keine Analytics-Ereignisse und keine Favoritenzuordnungen in öffentlichen URLs oder Sitemaps.
Login-Rücksprünge erlauben nur die drei kanonischen Pfade ohne freie Query/Fragment-Ziele.

### Nachweisarten

- Angular-Tests: Sprach-/Menü-/Routingzustände, Listen- und Kartenfehler, Bild-/Bewertungsleerstand,
  bestätigtes Entfernen, Pagination, begrenzte Parallelität, SSR, Doppelklick und verspätete Antworten.
- API-/PostgreSQL-Tests: Eigentum, CSRF, Fehlerbereinigung, Sitzungsprüfung, Transaktionsrollback,
  tatsächliche Besitzer-RLS mit einer nicht privilegierten Testrolle, Export und Kontolöschung.
- `node scripts/favorites-db-browser-smoke.mjs`: Produktionsbuild und echte lokale PostgreSQL-DB,
  bestehende Suchherzen, private Übersicht, Profilwechsel/History, Entfernen inklusive nicht
  öffentlichem Profil, getrennte Kunden-/Betreiberkonten und erneute Anmeldung, viele Einträge, leere Liste,
  Logout, DE/SQ/EN und 360/390/430/1280 px. Keine Anwendungs-API-Antworten werden ersetzt.
  Betreiber haben bereits vor Anmeldung gespeicherte Favoriten; beide Kontonavigationen,
  Profilherzen, Entfernen und unveränderter Kundenbestand werden ebenfalls geprüft.
  Fiktive Testdaten bleiben ausdrücklich fiktiv, sind aber wirklich in PostgreSQL gespeichert.

Der Browsernachweis benötigt eine isolierte lokale DB mit Migrationen, Referenzkatalog und
freigegebenem Demo-Seed, Chrome/Chromium und den Build. `.github/workflows/favorites-browser.yml`
führt diesen Ablauf aus und archiviert Screenshots und `verification.json`. Der vorhandene
lokale signierte OIDC-Testprovider aus den Anfragen-Tests prüft Codeaustausch, PKCE und JWTs;
er ist **nicht** die freigegebene ZITADEL-Testinstanz aus #38. Deren gesonderte Abnahme mit
den im Secret-Store vorhandenen Testkonten ist nicht durch diese Tests ersetzt. Kein
Runtime-Login-Bypass oder produktiver Konfigurationswechsel wird hinzugefügt.
