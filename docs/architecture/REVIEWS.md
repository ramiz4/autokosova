# Auftragsbezogene Bewertungen und Besuchsnachweise

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

| Bewertung | Nachweis |
|---|---|
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

Die lokale Entwicklung verwendet nur fiktive IDs und Testdateimetadaten. Ein echter Upload braucht
weiterhin die in ADR-001 beschriebene private Quarantäne, Malware-Prüfung, Objektablage und
rechtlich freigegebene Löschfrist. Ohne diese externen Produktivgates dürfen keine realen
Rechnungen oder Leistungsnachweise verarbeitet werden.
