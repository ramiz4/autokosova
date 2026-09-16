# Auftragsbezogene Bewertungen und Besuchsnachweise

Übergreifende Aktions- und Zugriffsgrenzen: [Rollen und Berechtigungen](ROLES-AND-PERMISSIONS.md). Diese gemeinsame Referenz unterscheidet Implementierungsstand, fachliche Erlaubnis und externe Freigaben.

Stand: 13. September 2026. Dieser Ablauf setzt #14 um und ergänzt das
[Datenmodell](DATA-MODEL.md), die [öffentliche Suche](SEARCH-MATCHING.md) und den Produktbrief.
Er behauptet keine technische Reparaturgarantie und erzeugt keine echten Erfahrungen oder Belege.

## Eine Erfahrung je belegtem Besuch

Eine angemeldete Person kann eine Bewertung für eine veröffentlichte Werkstatt einreichen, ohne
dass es vorher eine Onlinebuchung oder eine über AutoKosova gesendete Nachricht gab. Ein
Kontaktklick genügt nie. Jeder Einreichung muss ein eigener privater Nachweis zugeordnet sein; eine
Datei kann technisch nicht für eine zweite Bewertung wiederverwendet werden. Dadurch bleiben
mehrere tatsächliche Besuche derselben Person möglich, ohne denselben Beleg mehrfach zu zählen.

Die Bewertung enthält den Besuchsmonat, die konkrete Arbeit, optional die Fahrzeugmarke, Freitext
und vier gleichgewichtete Werte von 1 bis 5:

- Arbeitsqualität
- Kommunikation
- Preistransparenz
- Termintreue

Der angezeigte Gesamtwert ist `(Arbeitsqualität + Kommunikation + Preistransparenz +
Termintreue) / 4`, auf eine Dezimalstelle gerundet. Er ist eine Zusammenfassung von Erfahrungen,
keine Qualitätsgarantie.

## Privater Nachweis und Entscheidung

Zulässige Nachweisarten sind Rechnung, Arbeitsauftrag, Zahlungsbestätigung,
Werkstattbestätigung oder ein anderer Leistungsnachweis. Die Person darf nicht benötigte
personenbezogene Angaben vor dem Upload schwärzen. Die private Prüfliste fragt ausschließlich:

1. Passt der Nachweis zur Werkstatt?
2. Passt die Leistung zur eingereichten Bewertung?
3. Passt der Besuchsmonat?

Der Ablauf trennt Bewertung und Nachweis ausdrücklich:

| Bewertung                                              | Nachweis                                                  |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `submitted → under_review → published` oder `rejected` | `submitted → under_review → verified` oder `not_verified` |

Eine Moderation darf nur einem zugewiesenen Moderator oder einem Admin zugänglich sein. Eine
Veröffentlichung setzt alle drei positiven Prüfpunkte und einen noch verfügbaren privaten Nachweis
voraus. Bei Ablehnung erhält der Autor einen privaten, festen Grundcode, zum Beispiel
`evidence_not_sufficient` oder `duplicate_visit`; es gibt keine Veröffentlichung und keinen
öffentlichen Beleghinweis.

Eine Werkstattbestätigung ist nur eine der möglichen Nachweisarten. Eine negative Bewertung mit
einer geprüften Rechnung kann veröffentlicht werden, auch wenn die Werkstatt keine Bestätigung
gegeben hat. Die Werkstatt kann sie weder sperren noch löschen.

## Öffentlichkeit, Antworten und Updates

Nur eine veröffentlichte Bewertung zeigt öffentlich: Besuchsmonat, Arbeit, optionale
Fahrzeugmarke, Einzelwerte/Gesamtwert, Freitext und das Kennzeichen **„Besuch belegt“**. Nie
öffentlich sind Rechnung, Nachweisdatei, Speicherpfad, Prüfliste, Autor-ID, vollständige
Fahrzeugdaten, Reisezeit oder Moderationsnotiz.

Eine aktive Werkstattmitgliedschaft darf eine sichtbare Antwort veröffentlichen, aber keine
Bewertung oder deren Status ändern. Der Autor kann nach Veröffentlichung eine Reklamation oder
Nacharbeit als eigenes, zeitlich nachvollziehbares Update ergänzen. Diese Ergänzungen überschreiben
den ursprünglichen Bericht nicht.

## Aggregate, Filter und Reihenfolge

Profile und Suche berechnen Anzahl, Durchschnitt, neuesten Besuchsmonat und Zahl historisch
geprüfter Besuche ausschließlich aus veröffentlichten Bewertungen. Service- und
Fahrzeugmarkenfilter beziehen sich auf die bewertete Arbeit beziehungsweise den optionalen
Fahrzeugbezug, nicht auf private Anfrage- oder Belegdaten.

Die Suche nutzt eine Bewertung nur als kleinen, dokumentierten Gleichstandsentscheider: mindestens
zwei geprüfte veröffentlichte Besuche sind nötig; die Auswirkung ist auf vier Punkte begrenzt. Eine
einzelne 5,0 erhält keinen Ranking-Bonus und kann daher keine größere Erfahrungsbasis überstimmen.
Bezahlung, Abo, Werkstattbestätigung, Antworttext und Moderationsdruck haben kein Rankingfeld.

## Aufbewahrung und technische Grenze

Die rechtliche Frist ist vor einem öffentlichen Pilot noch festzulegen. Nach einer ausdrücklich
autorisierten Fristlöschung wird die private Datei unzugänglich und der Nachweisstatus erhält
`deleted_after_retention`. Die veröffentlichte Bewertung behält **„Besuch belegt“**, weil dies den
historischen Prüfstatus erklärt, aber nie den entfernten Beleg preisgibt.

Die lokale Entwicklung verwendet nur fiktive IDs und Testdaten. Die ausdrücklich aktivierte lokale Workflow-Demo kann zusätzlich harmlose versionierte Fixture-Dateien über den geschützten Dateivertrag öffnen; sie ist kein echter Upload-/Scan-Nachweis. Ein echter Upload braucht
weiterhin die in ADR-001 beschriebene private Quarantäne, Malware-Prüfung, Objektablage und
rechtlich freigegebene Löschfrist. Ohne diese externen Produktivgates dürfen keine realen
Rechnungen oder Leistungsnachweise verarbeitet werden.

## Moderationsarbeitsplatz und Widerspruch

Der Fallarbeitsplatz aus #95 verbindet den eigenen Prüfzustand mit drei getrennten Nachweisprüfpunkten und festen Ablehnungsgründen. Die versionierte Entscheidung wird im bestehenden Review-Store gespeichert, ohne Sterne oder Bericht umzuschreiben. Ein vorher abgelehnter oder veröffentlichter Beitrag kann bei offenem Widerspruch unabhängig geprüft werden; das Zuweisen dieses Widerspruchs ändert noch nicht die Sichtbarkeit. Die abschliessende Entscheidung schliesst den Fall auch dann, wenn der vorherige Zustand bestätigt wird.

Der vollständige Kunden-Einreichungsweg und Werkstattantwort-Editor folgen in #99. Lokale Prüffälle, darunter eine belegte negative Erfahrung, fehlender/ungeeigneter Nachweis und unabhängige/eigene Widersprüche, stehen im gemeinsamen Workflow-Seed zur Verfügung. Wiederholung erhält Entscheidungen und Löschungen. Einzelheiten und Code-/Testverweise in der zentralen Rollenreferenz.

## Verständliche Bewertungsfreigabe

In `/admin` und `/moderation` führt der sichtbare Filter **„Bewertungen“** zu den
Bewertungseinreichungen. Die Fallart heisst **„Bewertung prüfen und freigeben“**;
**„Bewertung prüfen“** öffnet den Fall, ohne eine Entscheidung auszuführen. Abgeschlossene
Fälle verwenden **„Bewertung ansehen“**. Der technische Falltyp `review_submission`,
englische Routen und bestehende Filterparameter bleiben unverändert.

Die Detailansicht unterscheidet Kundenbewertung, privaten Besuchsnachweis und
**„Bewertung freigeben oder ablehnen“**. Hinweise erklären die drei einzeln zu bestätigenden
Prüfpunkte, fehlende Nachweise und die Wirkung der Freigabe: Nur die Bewertung wird
öffentlich, der Nachweis bleibt privat. **„Bewertung freigeben“** führt weiterhin durch
die vorhandene Bestätigung; die begründete Ablehnung wird mit **„Ablehnung bestätigen“**
ausgelöst. DE/SQ/EN verwenden denselben Ablauf. Rollen, Zuweisung, Interessenkonflikte,
Revisionen und serverseitige Entscheidungsvoraussetzungen ändern sich nicht.

## Durchgängige Oberfläche (#99)

Vom öffentlichen Werkstattprofil führt „Bewertung schreiben“ zur kanonischen Route `/garages/:garageId/reviews/new`. „Meine Bewertungen“ unter `/reviews` ist eine private, paginierte Autorenliste mit Detail-/Nachweiszugriff und tatsächlichem Prüfstatus. Beide Routen existieren in DE/SQ/EN und erhalten ein explizites sicheres Login-Ziel. Vier Kriterien, Mittelwert, Leistung, Besuchsmonat und optionale Marke verwenden denselben gemeinsamen Vertrag in `src/shared/reviews.ts`.

`PostgresReviewStore` ist weiterhin der fachliche Writer. Einreichungen bleiben unveröffentlicht, bis der Arbeitsplatz aus #95 entscheidet. Einreichen → Zuweisen → Nachweis prüfen → Veröffentlichen/Ablehnen → eigener Status und öffentliches Profil → Werkstattantwort/Update wird in `e2e/specs/reviews.spec.ts` über echte HTTP-/DB-Wege geprüft. Öffentliche Seiten werden begrenzt geladen; eine gesperrte/gelöschte Werkstatt liefert keine öffentliche Bewertungsliste. Aggregate verwenden weiterhin die vorhandenen öffentlichen Views und Rankingregeln.

Der Kunden-Upload in der lokalen Demo nimmt nur die bereitgestellten fiktiven Textbytes an; er ist kein allgemeiner Rechnungsupload und kein Malware-Scan. Originalnachweise bleiben privat und werden nicht in Browserstorage, SSR oder öffentliche Antworten kopiert. Für andere Umgebungen ist fehlende Speicher-/Scanfreigabe ein sichtbarer Nichtverfügbarkeitszustand, kein simulierter Erfolg.

Einreichungsretry ist durch Autor/Nachweis serialisiert. Werkstattantworten verwenden Request-ID und aktuelle Antwortrevision; Kundenupdates eine eindeutige Request-ID. Selbstbewertungen, fremde Dateien/Einreichungen, fehlende aktive Mitgliedschaft, veraltete Revisionen und ausgeblendete Inhalte werden serverseitig abgewiesen. Die zuvor bestehenden HTTP-Vertragstests enthalten die nun verpflichtenden Retry-/Revisionsfelder; Berechtigungsassertionen bleiben erhalten.

Prüfungen: `test/review-workflow-postgres.test.ts` mit echter Nichtbesitzer-RLS, Angular-Erstellungs-/Beitragsformtests sowie verpflichtende Desktop-/Mobil-E2E-Szenarien. Tatsächlich ausgeführte Commands und externe Abgrenzungen stehen im Implementierungs-PR. Die übergreifenden Regeln AUTHOR-1/2/3 und RESPONSE-1 stehen in der zentralen Rollenreferenz.
