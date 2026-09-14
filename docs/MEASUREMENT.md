# Datensparsame Messung und Auffindbarkeit

## Messung bleibt standardmässig aus

`AUTOKOSOVA_ANALYTICS_ENABLED=false` ist der sichere Standard. Erst nach dokumentierter Betreiber- und Datenschutzprüfung darf ein Betreiber den Server-Schalter aktivieren. Auch dann sendet der Browser erst nach einer klaren lokalen Einwilligung. Eine Zustimmung speichert nur `granted` im Browser; sie enthält keine Kennung und wird weder an den Server noch an Dritte übertragen.

Der Endpunkt akzeptiert ausschließlich einen der folgenden Namen und speichert bei Aktivierung nur den UTC-Tag, den Namen und einen Zähler:

| Ereignis | Bedeutung | Nicht gemeint |
| --- | --- | --- |
| `search_started` | Eine Person startet eine Suche mit gültiger Leistung und Radius. | Kein Suchbegriff, kein Ort, kein Fahrzeug. |
| `search_results_displayed` | Eine Ergebnisantwort wurde in der Oberfläche angezeigt. | Kein Ranking, keine Treffer-ID. |
| `garage_profile_opened` | Ein veröffentlichtes Profil wurde angezeigt. | Keine Profil-ID oder Kontaktperson. |
| `contact_channel_opened` | Die Person öffnet bewusst WhatsApp oder Telefon. | Keine gesendete Nachricht, Buchung, Reparatur oder Zusage. |

Die Tabelle hat absichtlich keine Besucher-, Sitzungs-, Cookie-, IP-, User-Agent-, URL-, Such-, Werkstatt-, Fahrzeug-, Reise-, Datei- oder Freitextspalte. Bekannte Bot-/Crawler-/Headless-User-Agents werden verworfen; Tests laufen mit dem Schalter aus. Diese Filter sind nur eine grobe Schutzschicht, keine Verlässlichkeitsgarantie.

## Auswertung ohne erfundene Conversion

Vor einer Auswertung legt der Betreiber Zeitraum, Mindeststichprobe und Bot-/Testfilter fest. Eine mögliche, klar zu bezeichnende Funnel-Quote ist:

`Kontaktabsicht = contact_channel_opened / search_results_displayed`

Der Nenner ist die Anzahl tatsächlich angezeigter Ergebnislisten im selben UTC-Zeitraum. Die Quote beschreibt nur eine bewusste Öffnung eines externen Kanals. Sie ist weder Versand-, Buchungs-, Reparatur- noch Umsatzquote. Solange der Schalter aus ist oder die Mindeststichprobe nicht erreicht wird, wird keine Conversion-Rate berichtet.

## SEO-Grenzen

Die Startseiten in `/`, `/sq` und `/en` dürfen indexiert werden. Eine Sitemap entsteht erst nach Konfiguration einer HTTPS-`PUBLIC_SITE_URL` und enthält ausschließlich veröffentlichte öffentliche Profilpfade. Suchvarianten, Reparaturanfragen, Werkstattaufnahme, Authentifizierung und alle APIs erhalten `X-Robots-Tag: noindex, nofollow`; sie bleiben zusätzlich durch die bestehende serverseitige Berechtigung geschützt. `noindex` ist nie eine Zugriffskontrolle.

Öffentliche Werkstattprofile werden durch Angular serverseitig gerendert. Nutzertexte und Bewertungen bleiben im Original und werden als nicht übersetzt gekennzeichnet. Für strukturierte Bewertungsdaten gilt: nur veröffentlichte, sichtbare und echte Inhalte; keine Test- oder Beispielbewertung. Vor einer Aktivierung ist die dann aktuelle [Google Review-Snippet-Richtlinie](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) erneut zu prüfen. Besonders wichtig: Google verlangt sichtbaren, echten Inhalt und schließt selbststeuernde Bewertungen aus.

## Mobile, Zugänglichkeit und Performance

Die vier Kernansichten sind Startseite, Suche, öffentliches Profil und private Anfrage. Sie verwenden semantische Überschriften, native Formulare/Buttons/Links, sichtbare Fokuszustände und mindestens 44px hohe Bedienziele. Vor jeder öffentlichen Pilotfreigabe sind sie bei 320px, 360px, 768px und Desktop mit Tastatur, Screenreader-Schnellnavigation und echten Netzwerklatenzen erneut zu prüfen.

Das Repository erzwingt derzeit ein anfängliches JavaScript-Budget von höchstens 1MB und prüft Build sowie SSR-Smoke-Test. Für den Pilot gelten zusätzlich diese Messgrenzen: öffentliches HTML darf keinen privaten Kontext enthalten; initiales übertragenes JavaScript höchstens 175kB; keine blockierende Drittanbieter-Analyse; und eine LCP-Beobachtung mit realen Mobilnetzdaten vor Launch. Wird eine Grenze überschritten, wird sie als Betriebsrisiko dokumentiert und vor Pilot nachgebessert statt als Conversion-Ergebnis ausgegeben.

## Offener Launch-Gate

Eine fachkundige Prüfung aller SQ- und EN-Oberflächentexte durch eine geeignete Person bleibt vor einer öffentlichen Pilotfreigabe erforderlich. Diese technische Umsetzung behauptet keine solche Prüfung.
