# Werkstattaufnahme: Abnahme zu #61

Referenz ist das Original vom 14.09.2026 im [Issue-Kommentar](https://github.com/ramiz4/autokosova/issues/61#issuecomment-5662893308), 1586 × 992 px. Im angemeldeten Browser visuell geprüft; der ursprüngliche fehlende Anhang ist damit verfügbar.

Die Oberfläche übernimmt den kleinen gemeinsamen Logo-Header, hellen Berg-/Fahrzeug-Hero, das breite Formular mit drei nummerierten hellen Abschnitten, die rechte Ablauf-/Nutzen-/Datenschutzspalte und den blauen Hauptbutton. Das vorhandene freigegebene Berg-/Straßen-Asset wird wiederverwendet. Leistungen, Marken, Sprachen und Spezialisierungen verwenden dieselbe durchsuchbare Mehrfachauswahl mit Chips, Checkboxen und Escape-Taste.

Die notwendigen fachlichen Abweichungen vom Bild:

- Keine vorgewählten Beispiele. Marken und Spezialisierungen bleiben optional.
- Der Ablauf trennt privaten Entwurf, bewusste Einreichung und Freigabe. Es wird keine Nachricht oder bereits laufende Prüfung behauptet.
- Die vollständige Adresse bleibt manuell bearbeitbar. Der gemeinsame Ortskatalog erkennt ausdrücklich abweichende Ortsangaben. Es wird kein Geocoder oder Kartenanbieter aufgerufen und kein Ortsmittelpunkt als Werkstattposition gesetzt.
- Die Entfernung erscheint erst nach bestätigter Position als Luftlinie zum Suchort. Sie ist keine Entfernung zum Kunden.
- Ansprechpartner und Prüftelefon bleiben intern. Freigegebene Betriebsangaben sind nicht pauschal für immer privat.
- Mindestens 44 px hohe Bedienelemente, lesbare Texte, mehrzeilige Chips und Login-/Fehlerzustände benötigen mehr Höhe als das statische Bild. Die Seite darf scrollen; mobil folgt die Infospalte nach dem Formular.

## Funktion und Speicherung

Das neue Adressfeld ist Teil des gemeinsamen Profilvertrags. `business_address` ergänzt die vorhandene relationale Werkstatt; Migration 021 erhält Bestandsprofile ohne Adresse. Neue Onboarding-Formulare verlangen eine vollständige manuelle Adresse. Alte API-Clients ohne Adressfeld bleiben kompatibel. Sprache/Leistung/Marke werden mit gemeinsamen Katalogen validiert; gespeicherte eigene Sprach-/Spezialisierungsangaben bleiben beim Bearbeiten erhalten.

Mit konfigurierter Datenbank verwendet Aufnahme, privates Öffnen, Ändern und Einreichen den PostgreSQL-Store. Name, Adresse, Optionen, bestehender Werkstattpunkt, Einwilligung, Mitgliedschaft und Audit-Ereignis werden transaktional gespeichert. Das Profil kann über „Meine Werkstattprofile“ erneut geöffnet werden. Ohne Datenbank ist der vorhandene speicherbasierte Testadapter weiterhin nutzbar; er ist kein dauerhafter Produktionsspeicher.

Die neue UI erfasst keine zweite Werkstattposition. Änderungen an Adresse/Ort/Punkt nehmen die Bestätigung zurück. Das vorhandene Standortmodell aus #59 bleibt maßgeblich. Der Datenbanktest öffnet gespeicherte Entwürfe mit neu erstelltem Store und führt die Suche mit zwei bestätigten Punkten desselben Orts aus. Objektzugriffe werden zusätzlich unter einer temporären Testrolle ohne RLS-Bypass geprüft.

Bei Sitzungsverlust bleiben Eingaben im offenen Fenster. Ein ausdrücklicher Anmeldelink öffnet einen neuen Tab mit dem sicheren lokalisierten Rücksprung. Es werden weder private Formulardaten in URLs noch Browser-Langzeitspeicher geschrieben. Nach erfolgreicher Anmeldung kann im ursprünglichen Fenster weiter gespeichert werden.

## Rücknahme

Die Erweiterung ist additiv. Bei einer Rücknahme bleiben Adresse, bestehende Punkte und Mitgliedschaften in der DB erhalten. Keine automatischen Daten-/Volume-Löschungen. Die Rücksetzung der Standortbestätigung muss aktiv bleiben; ein älterer Client darf bestehende Adressen beim Öffnen nicht als erneut zu bestätigten Punkt behandeln. Vor öffentlichem Pilot bleiben die bereits dokumentierten Betriebs-/OIDC-/Dateispeicher-Gates bestehen.
