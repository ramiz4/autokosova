# Eigene Kontoauskunft und Profilseite

## Vertrag und Datenherkunft

`GET /api/session` bleibt unverändert `{ authenticated: boolean }`. Der bestehende
`AccountSessionService` liest für Header und Profilseite jetzt `GET /api/me`.
Dessen Besitzer stammt ausschließlich aus dem gültigen `autokosova_session`-Cookie.
Es gibt weder einen Benutzer-ID-Parameter zur Auswahl fremder Konten noch Schreiboperationen
für Kontofelder oder Rollen.

Die erfolgreiche Antwort enthält ausschließlich `userId`, optionale Felder `displayName`,
`username`, `email`, die tatsächlich wirksamen `roles`, `garageMemberships` und `expiresAt`.
Die Ablaufzeit dient ausschließlich dazu, die private Anzeige bei Sitzungsablauf zu löschen.
Ein fehlender Anzeigename fällt auf Benutzername, E-Mail und schließlich Konto-ID zurück;
fehlende Detailfelder werden ausdrücklich als nicht bereitgestellt angezeigt.

Optionale Angaben stammen aus `name`, `preferred_username` und `email` des **bereits
verifizierten** ID-Tokens. Signatur, Issuer, Audience, Subject und Ablaufprüfung bleiben im
vorhandenen OIDC-Adapter. Kein Userinfo-Nachladen, Claim-Dump oder Token wird an den Browser
weitergegeben. Profilfelder sind kein Nachweis einer E-Mail-Verifizierung. Fehlende Angaben
führen weder zu erfundenen Werten noch zu einem Login-Fehler. Die Anbieterkonfiguration muss
sie im ID-Token bereitstellen; sie wird durch diese Änderung nicht verändert.

Rollen kommen unverändert aus `AccessStore.getPrincipal`: Basisrolle `customer` sowie die
serverseitig verifizierten Projektrollen `moderator` und `admin`. Alle wirksamen Rollen werden
angezeigt. Ein neuer erfolgreicher Login ersetzt erhöhte Rollen durch die frisch verifizierten
Grants. Die im aktuellen Browser zuvor verwendete Sitzung wird nach erfolgreichem Callback
widerrufen. Profilfelder sind an die neue Sitzung gebunden, nicht an einen globalen UI-Cache.

## Garage-Mitgliedschaften

Die bestehende Garage-Speicherschicht stellt `listOwnMemberships` bereit: nur aktive Einträge
für das eigene Subject, mit `garageId`, soweit vorhanden `garageName`, und `owner`/`editor`.
PostgreSQL verwendet die bestehende `membership`-/`garage`-Relation und den bisherigen
Transaktions-/Berechtigungskontext. Keine neue Tabelle oder parallele Berechtigungsquelle.
Die In-Memory-Implementierung hat dieselbe ausdrückliche Besitzer-/Statusfilterung.

Die allgemeine Admin-Zugriffsberechtigung und ein OIDC-Rollenname sind **keine Membership**.
Deshalb wird nicht `listOwnedGarages`/`hasGarageAccess` als Mitgliedschaftsnachweis verwendet.
Widerrufene und fremde Mitgliedschaften werden nicht ausgegeben. Ein Datenbankfehler liefert
503 statt einer irreführend leeren Liste; interne Fehlerdetails werden nicht ausgegeben.

## UI, Navigation und Datenschutz

`/profile`, `/sq/profile` und `/en/profile` sind kanonische Routen. Das bestehende Kontomenü
verlinkt die Angular-Seite. Konto und Rollen sind schreibgeschützt; die vorhandene Sprachwahl
und CSRF-geschützte Abmeldung werden wiederverwendet. Sprachwahl verändert die URL und ist
keine kontoweit gespeicherte oder geräteübergreifend synchronisierte Einstellung.

SSR rendert nur die neutrale Ladeansicht, niemals Konto-/Rollen-/Membershipdaten. Private
Abfragen beginnen erst nach Browser-Rendering. `/profile` und `/api/me` erhalten
`Cache-Control: private, no-store`, `Vary: Cookie` und `noindex, nofollow`; die Profilseite ist
nicht in der Sitemap. Seitentitel und Beschreibungen bleiben allgemein. Es gibt keine neuen
Analytics-Ereignisse, öffentlichen Kontodaten, Kontaktaktionen oder Log-Ausgaben mit Profilen.

Der Dienst unterscheidet Laden, Gast, Fehler und bestätigtes Konto. Er hält Identität nur im
Speicher, entfernt sie vor Neuladen/Abmeldung und verwirft verspätete Antworten. Ablauf,
Seitenverlassen und Wiederherstellung aus Browser-History werden berücksichtigt. Fokus und
Sichtbarkeitswechsel validieren die Sitzung neu. Andere Tabs erhalten bei Abmeldung nur ein
Invalidierungssignal, keine Kontodaten. Fehlgeschlagene Abmeldung wird nicht als Erfolg
bestätigt; ein frischer Abruf kann den tatsächlichen Zustand wiederherstellen.

Gäste erhalten von `/api/me` 401 mit `loginAvailable`. Fehlende OIDC-Konfiguration wird auf
der Profilseite übersetzt erklärt; die öffentliche Suche bleibt erreichbar. Login verwendet
weiterhin `/auth/login` und die vorhandene Safe-Return-Allowlist, erweitert um die drei
Profilpfade. Profil-Rücksprünge akzeptieren keine beliebigen Query-Parameter oder Fragmente.

## Automatisierte Prüfung

- `test/account.test.ts`: eigene Auskunft, Gäste, Ablauf, Logout/CSRF, Rollenentzug,
  Manipulationsversuche, minimale Serialisierung, Caching, fehlende Claims und Speicherfehler.
- `test/account-oidc.test.ts`: lokal im Testprozess signierter OIDC-Testprovider mit PKCE und
  echtem JWT-Verifier; vier fiktive Rollenfälle, Kontowechsel, entfernter Grant, fehlende Claims,
  falscher Issuer und sichere Rücksprünge. Das ist **kein Nachweis gegen die ZITADEL-Testinstanz**.
- PostgreSQL-Onboardingtest: eigene aktive Owner-/Editor-Mitgliedschaften, Admin ohne Membership,
  fremde und widerrufene Einträge, unter dem bestehenden eingeschränkten DB-Testbenutzer.
- Angular-Service-/Komponententests: Zustände, späte Antworten, Sitzungswechsel, Metadaten,
  Übersetzungen, mehrere Rollen, fehlende Felder, Menü, Sprachwahl und Logout.
- `node scripts/account-browser-smoke.mjs` nach `npm run build`: Chrome mit ausdrücklich fiktiven,
  ausschließlich im Testtreiber abgefangenen API-Antworten. DE/SQ/EN bei 360/390/430/1280/1448 px,
  Tastatur/Fokus, Touch-Ziele, Überläufe, Neuladen, Sprachwechsel, Kontowechsel und Fehlerszenarien.
  Der CI-Check `Account browser` behält Screenshots sieben Tage als Artefakt.

## Echte lokale Test-OIDC-Abnahme – noch offen

Für diese Bearbeitung sind der freigegebene 1Password-Eintrag und die vier vorhandenen
Testkonten nicht zugänglich. Keine Zugangsdaten wurden angefordert, kopiert oder erfunden.
Die Prüfung aus #38 ist daher **nicht erneut ausgeführt** und darf nicht durch die
automatisierten Fixtures als erfüllt markiert werden.

| Bestehender fiktiver Kontotyp | Erwartete Abnahme | Status |
|---|---|---|
| Kunde | Identität, `customer`, Profil, Reload, Logout | Nicht ausgeführt: Testzugang fehlt |
| Garage-Mitglied | `customer` und tatsächliche lokale aktive Membership getrennt | Nicht ausgeführt: Testzugang und Subject/Membership-Zuordnung fehlen |
| Moderator | `customer` + `moderator`, keine erfundene Membership | Nicht ausgeführt: Testzugang fehlt |
| Admin | Alle tatsächlich erteilten Projektrollen, keine fremden Memberships | Nicht ausgeführt: Testzugang fehlt |

Mit der bestehenden erlaubten lokalen Konfiguration gemäß `AUTH-INTEGRATION.md`:
`npm run dev:demo`, dann `/profile` → Login → Kontomenü → Profil → Reload → Sprachwechsel →
Logout → anderes Testkonto. Für das Garage-Mitglied den aktiven Datensatz im eigenen lokalen
Testbestand prüfen; einen fehlenden Datensatz nicht durch einen OIDC-Rollennamen ersetzen.
Nach autorisiertem Entfernen eines erhöhten **Testprojekt**-Grants erneut anmelden und sowohl
Anzeige als auch geschützte API prüfen. Keine Produktivkonfiguration ändern. Pro Kontotyp
nur Ergebnis, Sprache, Viewport und anonymisierte Fixture-Bezeichnung dokumentieren, niemals
Token, Cookie, Passwort oder reale personenbezogene Daten.
