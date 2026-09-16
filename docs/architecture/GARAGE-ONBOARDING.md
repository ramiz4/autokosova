# Werkstattaufnahme und Unternehmensdatenprüfung

Übergreifende Aktions- und Zugriffsgrenzen: [Rollen und Berechtigungen](ROLES-AND-PERMISSIONS.md). Diese gemeinsame Referenz unterscheidet Implementierungsstand, fachliche Erlaubnis und externe Freigaben.

Die Oberfläche unter `/garages/new`, die manuelle Betriebsadresse, Such-/Mehrfachauswahl und
der dauerhafte PostgreSQL-Aufnahmeablauf sind in [Abnahme #61](../design/ONBOARDING-61.md) beschrieben.
Migration 021 ergänzt `garage.business_address`; der bestehende Werkstattpunkt aus #59 bleibt
die einzige Position. Adresse/Ort/Punkt ändern setzt den Standortprüfpunkt zurück.

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

WhatsApp-Unterstützung ist eine getrennte optionale Profilangabe. Sie kann nur zusammen mit einer
öffentlichen Telefonnummer gesetzt werden. Die öffentliche Profilansicht bietet WhatsApp nur bei
dieser ausdrücklichen Angabe an; sie leitet die Fähigkeit nicht aus der Telefonnummer ab.

## Bilder und Belege

Ein Werkstattfoto wird nur als JPEG, PNG oder WebP bis 5 MiB angenommen. Der Server begrenzt die
Eingabepixel, richtet das Bild aus, skaliert es auf maximal 1600 px Kantenlänge und schreibt ein
neues WebP ohne übernommene EXIF-, XMP- oder IPTC-Metadaten. Das beseitigt insbesondere unnötige
Standortmetadaten. Das Bild bleibt bis zur Adminfreigabe privat; es ist zusätzlich nur bei einem
veröffentlichten Profil öffentlich lesbar.

Die lokale Demo-Galerie ist davon getrennt: Sie verwendet ausschließlich versionierte,
optimierte Konzeptbilder für die klar gekennzeichneten `demo-*`-Profile. Diese Bilder werden nie
als Nachweis, Foto oder Angebot eines realen Betriebs behandelt.

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

## Administrative Prüfung und dokumentierte Hilfe (#94)

`/admin/garages` enthält eine begrenzte Gesamt-/Statussuche mit privater Detailprüfung. Die vier Checklistenwerte, tatsächliche Position, Unternehmensdatei, Fotos und Memberships werden serverseitig aus dem bestehenden Datenmodell gelesen. Änderungen verwenden `admin_revision` plus feste Grundcodes. Nicht vorhandene, gesperrte oder nicht verfügbare Unternehmensnachweise verhindern Erstveröffentlichung; blosse Checkboxen ersetzen den verfügbaren Nachweis nicht. Gelöschte Profile werden nicht reaktiviert.

`PostgresAdministrationStore` verwendet den bestehenden Garage-Onboarding-Writer statt einer zweiten Veröffentlichungspipeline. Eine administrative Sperre bleibt von `moderation_hidden_case_id` getrennt; die Moderationsaktion darf sie nicht aufheben. Rücknahme der Admin-Sperre benötigt weiterhin gültige Voraussetzungen. Eigene Werkstattbeteiligung verhindert Prüfung/Entscheidung auch bei Adminrolle.

Unterstützte Aufnahme unter `/admin/support` und notwendige Profilkorrektur verlangen einen dokumentierten Auftrag, tatsächliches vorhandenes Antragstellerkonto und Einwilligungsversion. Das normale Aufnahmeformular wird wiederverwendet. Die Administration wird nicht Eigentümer und täuscht keine Kundenanmeldung vor. Auftrag und Audit werden mit der Änderung gespeichert; Position-/Adressänderungen setzen die Standortbestätigung zurück.

Foto-/Dateiquellen werden nicht erfunden. Die lokale Demo enthält allowlist-gebundene, explizit fiktive Unternehmensdokumente und Fotos. Eine Fotofreigabe ändert den tatsächlichen Sichtbarkeitszustand; ein fehlender freigegebener externer Adapter bleibt erkennbar nicht verfügbar. Die Unternehmensprüfung ist keine Aussage über Reparaturqualität.

UI → API → Berechtigungsprüfung ist in `ROLES-AND-PERMISSIONS.md` festgehalten. Prüfungen: `administration-postgres.test.ts`, `admin-console.component.spec.ts` und `e2e/specs/administration.spec.ts`, ergänzt um vorhandene Onboarding-/Moderationsregressionen. Tatsächliche Ausführung und CI-Status stehen im zugehörigen PR, nicht in fiktiven Abnahmebehauptungen.
