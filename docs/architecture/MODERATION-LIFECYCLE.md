# Moderation, Meldungen und Datenlebenszyklus

Übergreifende Aktions- und Zugriffsgrenzen: [Rollen und Berechtigungen](ROLES-AND-PERMISSIONS.md). Diese gemeinsame Referenz unterscheidet Implementierungsstand, fachliche Erlaubnis und externe Freigaben.

Stand: 13. September 2026. Dieser Ablauf setzt #15 mit Testdaten um. Er ist keine rechtliche
Beratung und ersetzt weder die Betreiberentscheidung noch geprüfte Pflichttexte vor einem
öffentlichen Pilot.

## Getrennte Fälle statt automatischer Entfernung

Eine Meldung erzeugt einen eigenen, zugriffsbeschränkten Fall mit Priorität, Status und festem
Grundcode. Sie verändert das gemeldete Profil oder die gemeldete Bewertung nicht automatisch.
Erst ein zugewiesener Moderator oder ein Admin kann eine begründete Aktion ausführen. Reportfälle und kanonische Einreichungsfälle bleiben dabei getrennt; generisches Freigeben schliesst eine Meldung ab, ersetzt jedoch weder Besuchsnachweisprüfung noch Admin-Erstfreigabe einer Werkstatt:

- freigeben oder ablehnen;
- Rückfrage stellen;
- vorläufig ausblenden;
- wiederherstellen.

Die Warteschlange enthält eingereichte Werkstattprofile, Besuchsnachweise über ihre zugehörige
Bewertung sowie eingegangene Meldungen. Admins sehen die gesamte Warteschlange; Moderatoren sehen
nur zugewiesene Fälle. Ein Autor, eine Werkstatt oder der Melder kann nach einer Entscheidung
einen Widerspruch einreichen. Der eigene Fallstatus und der feste Grundcode sind sichtbar; der
private Meldetext und interne Prüfdaten sind es nicht.

Eine negative Meinung ist kein Grund für eine Löschung. Weder Abo noch Werkstattantwort,
Bestätigung oder Beschwerde beeinflussen die organische Reihenfolge. Die private Meldedetailangabe
wird nicht in `moderation_event`, öffentliche Antworten oder Standardlogs kopiert.

## Audit und Zugriff

`moderation_event` speichert nur Akteur-ID, Ereignistyp und Gegenstand-ID. Die Migration schaltet
RLS für das Audit-Log ein: Lesen ist Administrationssache; ein normaler Nutzer kann nur ein
Ereignis für seine eigene Aktion anhängen. Die Laufzeitrolle darf nicht Eigentümer der Tabellen
sein, damit PostgreSQL-RLS nicht umgangen wird. Ereignisse werden nicht über eine öffentliche API
ausgegeben.

Private Nachweise bleiben beim Autor, einem zugewiesenen Moderator oder einem Admin. Eine
vorläufige Ausblendung entfernt ausschließlich die öffentliche Sichtbarkeit. Sie löscht weder
Beleg noch Bewertung und kann nachvollziehbar zurückgenommen werden.

## Fristen und Löschung

Es gibt bewusst **keine** voreingestellten Produktivfristen. Bevor die Bearbeitung von
Löschanträgen aktiviert wird, muss ein Betreiber eine versionierte Regel mit einem Verweis auf die
fachliche/rechtliche Freigabe hinterlegen. Die Regel enthält getrennt:

| Bereich                        | Konfigurationswert                 |
| ------------------------------ | ---------------------------------- |
| private Besuchsnachweise       | Aufbewahrungstage                  |
| gespeicherte Reparaturanfragen | Aufbewahrungstage                  |
| Meldungsdetails                | Aufbewahrungstage                  |
| restriktive Audit-Ereignisse   | Aufbewahrungstage                  |
| veröffentlichte Erfahrungen    | löschen oder anonymisiert erhalten |

Ohne diese Regel bleibt ein Löschauftrag sichtbar als `blocked_by_policy`; er wird nicht
irrtümlich oder stillschweigend ausgeführt. Bei einem aktiven, freigegebenen Ablauf werden private
Uploads, gespeicherte Anfragen, Fahrzeuge, Sitzungen und nicht veröffentlichte Bewertungen
gelöscht. Bei der expliziten Variante `retain_anonymized` bleibt eine bereits öffentliche
Erfahrung ohne Autorenbezug bestehen; der private Nachweis wird gesperrt/gelöscht und nur der
historische Prüfhinweis bleibt sichtbar. Eigentümer eines veröffentlichten Werkstattprofils werden
nicht automatisch entfernt: Betreiber müssen zuerst eine dokumentierte Übergabe oder
Unveröffentlichung entscheiden.

Die Datenbank markiert eine Datei vor dem externen Löschen unzugänglich und legt für einen echten
Speicheranbieter eine wiederholbare `object_deletion_task` an. Der lokale Test prüft den gesamten
Pfad mit ausschließlich fiktiven Dateimetadaten bis zur simulierten privaten Objektlöschung. Ein
Produktiv-Worker benötigt vor dem Pilot noch den konfigurierten privaten Bucket, getrennte Rechte,
Retry-/Alarmverhalten und einen dokumentierten Wiederherstellungs- beziehungsweise
Löschtest.

## Pflicht vor öffentlichem Pilot

Vor #18/öffentlicher Veröffentlichung muss der Betreiber mit geeigneter fachlicher Beratung
mindestens festlegen und freigeben:

1. Betreiber, Plattformrolle, Kontaktweg und zuständige Beschwerdestelle.
2. Fristen, Löschregel für öffentliche Erfahrungen und Belege sowie die zugehörige
   Betreiberfreigabe-Referenz.
3. Die final geprüften Kontakt-, Impressums- und Datenschutzhinweise in Deutsch und Albanisch.
4. Den privaten Object-Storage-Worker samt Zugriffs-, Retry- und Löschprobe.

Bis dahin sind diese Hinweise keine rechtssicheren Rechtstexte, die lokale Regelkonfiguration ist
nur ein technischer Gate, und ein öffentlicher Pilot bleibt gesperrt.
