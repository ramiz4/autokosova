# Öffentliches Werkstattprofil

Das Profil unter `/garages/:garageId` ist die öffentliche, selbst gewählte Entscheidungs- und
Kontaktansicht. Sprachpräfixe ändern ausschließlich die Produktsprache; Garage-Beschreibung und
Bewertungstexte bleiben im veröffentlichten Original.

## Veröffentlichte Daten

Die Ansicht verwendet ausschließlich das öffentliche Profil, veröffentlichte Bewertungen und
freigegebene Foto-IDs. Private Ansprechpartner, Belege, Fahrzeugdaten, Reisezeiten,
Moderationsnotizen und Koordinaten werden nicht geladen oder angezeigt. Lokale Demo-Profile
verwenden ein veröffentlichtes Galeriebild als klar gekennzeichnetes Profilbild. Bei anderen
Profilen ersetzt ein neutraler Initialenplatzhalter ein fehlendes Logo; Gründungsjahr, Teamgröße
oder Erfahrung werden ohne entsprechende Datenfelder nicht erfunden.

`Unternehmensdaten geprüft` beschreibt die Prüfung von Kontakt, Ansprechpartner,
Unternehmensnachweis und Standort. `Werkstattbesuch belegt` gehört nur zu einer einzelnen
veröffentlichten Bewertung mit privat geprüftem Nachweis. Beide Aussagen sind unabhängig und
keine Reparaturgarantie.

## Suchkontext und Teilen

Die Ergebnisliste erhält beim Profilübergang nur die bereits öffentlichen Filter `all`, `places`,
`service`, `vehicleMake`, `sort` und `page`. Das Profil sendet für eine Entfernungsberechnung nur
die validierten Orts-/Radiuswerte an die öffentliche Profil-API. Der Server berechnet den nächsten
passenden Suchort aus der bestätigten Werkstattposition und gibt nur Ort und abgeleitete
Entfernung zurück. Koordinaten bleiben intern. Ohne Suchkontext erscheint keine Entfernung.

Zurück zur Suche bewahrt diese öffentlichen Filter. Teilen entfernt sämtliche Query-Parameter
und verwendet ausschließlich die kanonische öffentliche Profil-URL. Wenn Web Share fehlt oder
fehlschlägt, zeigt die Anwendung eine markierbare URL und versucht das Kopieren über die
Browser-Zwischenablage. Bei verweigerter Berechtigung bleibt die URL manuell kopierbar.

## Galerie und Interaktionen

Die Galerie zeigt jede freigegebene Foto-ID einmal. Ein, zwei und viele Fotos erhalten jeweils
einen eigenen Aufbau; ohne Fotos erscheint ein ehrlicher Leerzustand. Das Vollbild kann über
Buttons geöffnet, mit Pfeiltasten oder sichtbaren Aktionen gewechselt und mit Escape geschlossen
werden. Der Fokus kehrt zum auslösenden Foto zurück.

Der Profilkopf bleibt am Desktop unter der Top-Navigation stehen. Favorit und Kontakt bleiben
dadurch sichtbar; eine zweite Kontaktkarte im Inhaltsbereich ist nicht erforderlich. Über uns und
Bewertungen folgen links als flacher Lesefluss. Leistungen, Marken und Standort bleiben rechts in
drei einheitlichen hellen Info-Cards aus dem Onboarding sticky sichtbar. Fotos erscheinen ausschließlich
in der Galerie am Seitenanfang.

Die Abschnitte besitzen weiterhin direkte Anker (`#about`, `#reviews`, `#services`, `#makes`,
`#location` und `#photos`). Ein Fragment kann direkt geöffnet und über die Browser-Historie
gewechselt werden. Es gibt bewusst keine zusätzliche Tab- oder Auswahlnavigation.

Lokale Demo-Profile erhalten vier feste, optimierte Konzeptbilder aus den versionierten
Designreferenzen. Die Foto-IDs werden ausschließlich für veröffentlichte `demo-*`-Profile über
denselben öffentlichen Fotopfad ausgeliefert. Die Profilkennzeichnung macht deutlich, dass es
sich nicht um Fotos oder Angebote realer Betriebe handelt.

Favoriten verwenden die kontogebundene, CSRF-geschützte Speicherung. Gäste erhalten einen
Anmeldelink und lösen keinen privaten Favoriten-Request aus. Die Kontaktaktion öffnet die unter
[Direktkontakt](DIRECT-CONTACT.md) beschriebene Vorschau. Eine Bewertungsschaltfläche erscheint
erst, wenn ein vollständig angebundener Nachweis- und Speicherablauf aus der Profilansicht
existiert; bis dahin wird kein funktionsloses Formular angeboten.

## Mobile Grenze

Auf kleinen Viewports sind Galerie, Profilkopf, die drei Info-Cards und die weiteren Abschnitte
gestapelt. Eine feste Kontaktleiste bleibt erreichbar; zusätzlicher unterer Seitenabstand
einschließlich iOS Safe Area lässt Footer und letzte Inhalte vollständig über die Leiste scrollen.
Alle interaktiven Flächen sind mindestens 44 Pixel hoch.
