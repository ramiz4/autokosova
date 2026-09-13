# Direktkontakt und externe Links

Stand: 13. September 2026. Diese Regeln setzen #13 um und ergänzen [SEARCH-MATCHING](SEARCH-MATCHING.md) und das [Datenmodell](DATA-MODEL.md).

## Ablauf

Die Landing Page erlaubt Gästen die Suche nach Leistung, Ort und Luftlinienradius. Ein Suchergebnis führt ausschließlich zum öffentlich freigegebenen Profil der ausgewählten Werkstatt. Dort wird kein Kontakt automatisch ausgelöst und es findet keine Weiterleitung an andere Betriebe statt.

Das Profil erklärt den begrenzten Umfang von **„Unternehmensdaten geprüft“** und zeigt bis #14 den Leerzustand **„Noch keine Bewertungen“** statt Sterne, Nutzerzahlen oder Qualitätsversprechen. Es zeigt nur veröffentlichte Profildaten: Leistungen, Markenbezug, Sprachen, Selbstauskünfte, Standortreferenz, freigegebene Fotos und eine valide öffentliche Telefonnummer.

## Kontaktvorschau

Der Browser erstellt zunächst einen sichtbaren Textentwurf. Der Standardtext nennt nur die vom Kunden gewählte Werkstatt. Fahrzeug- und Reparaturangaben kommen niemals aus einer gespeicherten Anfrage oder einer URL. Sie werden nur in die Vorschau aufgenommen, wenn der Kunde die lokale Freigabe aktiviert und sie selbst eingibt.

VIN, Kennzeichen, Dokumente, private Upload-URLs sowie genaue Reisedaten haben in diesem Entwurf kein Feld und werden nicht automatisch übertragen. Der Ablauf sendet keinen Text über AutoKosova, schreibt keinen `ContactIntent` und behauptet keine Zustellung, Buchung, Verfügbarkeit oder Reparaturauftrag.

## WhatsApp und Telefon

Eine Telefonnummer wird vor jedem externen Link zu einem beschränkten internationalen Nummernformat normalisiert. Ungültige Werte erzeugen weder einen `tel:`- noch einen WhatsApp-Link. WhatsApp verwendet ausschließlich `https://wa.me/<digits>?text=<encodeURIComponent(preview)>`; damit bleiben Unicode-Zeichen im sichtbaren Entwurf und im Link korrekt kodiert.

Die Aktion ist ein normaler Nutzerlink, kein Popup und keine WhatsApp-Business-API. Wenn WhatsApp fehlt oder der Browser einen neuen Tab nicht öffnet, bleibt der validierte Telefonlink als Fallback sichtbar. Ein Klick bleibt Kontaktabsicht, nicht gesendete Nachricht oder bestätigter Kontakt.
