# Kontogebundene Favoriten

Herzen in der öffentlichen Werkstattsuche speichern Favoriten im angemeldeten Konto. Gäste können weiterhin suchen und Kontakt auswählen; das Herz bietet ihnen die Anmeldung an. Login-Rücksprünge erlauben ausschließlich lokale bekannte Pfade und validierte öffentliche Suchfilter.

## Vertrag und Berechtigungen

- `GET /api/session` liefert nur den Anmeldestatus, keine Konto-ID.
- `GET /api/me/favorites` liefert eigene `garageIds`.
- `PUT /api/me/favorites/:garageId` speichert idempotent eine veröffentlichte Werkstatt.
- `DELETE /api/me/favorites/:garageId` entfernt idempotent den eigenen Favoriten, auch wenn das Profil inzwischen nicht mehr öffentlich verfügbar ist.

Alle Antworten sind privat und nicht cachebar. Schreibzugriffe benötigen eine echte Sitzung und CSRF-Token. Der Besitzer kommt ausschließlich aus der Sitzung. Migration 019 ergänzt `garage_favorite` mit zusammengesetztem Primärschlüssel, Fremdschlüsseln und Besitzer-RLS. Jede Datenbankoperation setzt `app.user_id` innerhalb derselben Transaktion und begrenzt die Abfrage zusätzlich auf den Besitzer. Favoriten gehören zum privaten Datenexport und werden bei genehmigter Kontolöschung entfernt. Kontolöschung und neue Favoriten serialisieren über die Benutzerzeile; ein gesperrtes Konto wird nicht reaktiviert.

## Oberfläche

Das Herz zeigt den bestätigten Serverzustand, sperrt parallele Änderungen derselben Karte und meldet Fehler ohne falschen Speichererfolg. Die Speicherung verwendet keinen lokalen Browser-Speicher. Vor einem privaten Lesezugriff wird der öffentliche Sitzungsstatus geprüft; parallele Abfragen teilen denselben laufenden Request. Gäste rufen den privaten Favoriten-Endpunkt nicht auf. Toasts verschwinden nach 5 Sekunden, Hinweise zur Anmeldung und Fehler nach 8 Sekunden; erneute Meldungen setzen die Laufzeit zurück.

Ein Neuladen oder eine weitere Sitzung desselben Kontos liest denselben Datenbestand.

Die gemeinsame Navbar liest den echten Sitzungsstatus. Angemeldet erscheinen Glocke und Konto-Menü statt Login/Registrieren; Abmeldung erfolgt mit CSRF-Schutz. Die Glocke erklärt, dass Benachrichtigungen noch nicht verfügbar sind. Escape und Außenklick schließen die Menüs.

## Lokaler Nachweis

UI- und API-Tests prüfen Authentifizierung, CSRF, Besitzergrenzen, Persistenz, Idempotenz und Fehlerzustände. PostgreSQL-Tests prüfen erneutes Öffnen des Stores sowie Export und Löschung. Auf Port 4200 wurde mit dem fiktiven Customer-OIDC-Testkonto zusätzlich Anmeldung → Herz speichern → API bestätigen → Neuladen → Herz entfernen → Abmeldung geprüft. Demo-Bewertungen stammen ausschließlich aus dem ausdrücklich fiktiven `demo-workflows`-Seed.

Migration 019 muss vor dem neuen Serverstand angewendet werden. Bei Code-Rücknahme kann die zusätzliche Tabelle bestehen bleiben; sie wird nicht automatisch gelöscht.
