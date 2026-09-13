# Werkstattaufnahme und Unternehmensdatenprüfung

Dieser Ablauf implementiert #10. Er ist kein Verzeichnisimport, keine Werbeaktion und keine
Qualitätszertifizierung. Lokale Tests und Entwicklungsdaten verwenden ausschließlich fiktive
Werkstätten.

## Aufnahme ohne Ansprache

1. Eine angemeldete Werkstattperson prüft zunächst ausschließlich veröffentlichte mögliche
   Dubletten anhand von Name und Ort. Ein fremder privater Entwurf wird dabei nie offengelegt.
2. Die Selbstaufnahme erzeugt einen privaten Entwurf, eine aktive Mitgliedschaft ausschließlich
   für den Antragsteller und einen Audit-Eintrag. Sie setzt die aktuell akzeptierte
   Einwilligungsversion voraus.
3. Unterstützte Aufnahme ist ein separater Adminvorgang. Sie akzeptiert nur den dokumentierten
   Zustimmungsgrund `documented_support_request` und hält Version, Antragsteller, Bearbeiter und
   Zeitpunkt fest. Die Anwendung sendet dabei keine Einladung, E-Mail oder andere Ansprache.
4. Profiländerungen bleiben Entwurf oder setzen einen wartenden Antrag wieder auf Entwurf. Erst
   die aktive Mitgliedschaft desselben Betriebs kann ihn erneut zur Prüfung einreichen.

## Prüfliste und Veröffentlichung

Ein Admin dokumentiert pro Antrag genau diese vier Prüfpunkte mit `verified`, `failed` oder
`not_checked`:

- erreichbare Telefonnummer;
- Ansprechpartner;
- Unternehmensnachweis als privates Dokument;
- Standort anhand des ausgewählten Orts und der internen Prüfung.

`Unternehmensdaten geprüft` erscheint im öffentlichen Lesemodell nur, wenn alle vier Punkte
`verified` sind. Das Kennzeichen bedeutet allein, dass die genannten Unternehmensangaben geprüft
wurden. Es verspricht weder Reparaturqualität noch Preis, Termin, Erreichbarkeit oder eine
technische Garantie und ist nicht von Abo oder Bezahlung abhängig.

Der Statuswechsel ist eng: `draft`/`rejected` → `pending_review` durch eine aktive Membership,
`pending_review` → `published`/`rejected` durch Admin, `published` → `suspended` durch Admin.
Öffentliche API-Routen lesen ausschließlich veröffentlichte Profildaten. Ansprechpartner,
Kontakt-E-Mail, Zustimmungsdaten, Prüfstatus im Detail und Unternehmensbelege bleiben privat.
Spezialisierungen heißen im öffentlichen Modell ausdrücklich `selfReportedSpecializations`; sie
sind Selbstauskünfte und keine verifizierte Qualifikation.

## Bilder und Belege

Ein Werkstattfoto wird nur als JPEG, PNG oder WebP bis 5 MiB angenommen. Der Server begrenzt die
Eingabepixel, richtet das Bild aus, skaliert es auf maximal 1600 px Kantenlänge und schreibt ein
neues WebP ohne übernommene EXIF-, XMP- oder IPTC-Metadaten. Das beseitigt insbesondere unnötige
Standortmetadaten. Das Bild bleibt bis zur Adminfreigabe privat; es ist zusätzlich nur bei einem
veröffentlichten Profil öffentlich lesbar.

Unternehmensnachweise verwenden die vorhandene private Datei-Freigabe. Nur aktive Mitglieder
desselben Betriebs oder Admins bekommen einen kurzlebigen Download-Grant. Der öffentliche View
enthält weder Dokument-IDs noch Speicherpfade.

## Testgrenze

Die API- und Bildtests decken Statusübergänge, CSRF, fremde Mitgliedschaft, verborgene Entwürfe,
private Nachweise, Freigabesichtbarkeit und Metadatenentfernung ab. Der reale Betreiberprozess
(konkrete Nachweisarten, Aufbewahrungsfristen und Prüfpersonal) bleibt vor einem öffentlichen
Pilot ein offenes Produktivgate; es werden keine echten Unternehmensdaten oder Kontakte erfasst.

Die Bildverarbeitung nutzt [sharp](https://sharp.pixelplumbing.com/api-output/): ohne eine
Metadata-Preservation-API entfernt die Standardausgabe Metadaten; `autoOrient` übernimmt die
Bildausrichtung vor der Skalierung. Diese technische Umsetzung ersetzt keine rechtliche
Aufbewahrungsentscheidung.
