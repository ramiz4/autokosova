# Öffentliche Suche und Matching

Stand: 13. September 2026. Diese Regeln setzen #12 um und ergänzen [ADR-001](ADR-001.md) sowie das [Datenmodell](DATA-MODEL.md).

## Daten- und Schutzgrenze

Die öffentliche Suchanfrage enthält ausschließlich eine Leistung, einen bis drei Orts-IDs mit jeweils 5–100 km Radius sowie optionale Fahrzeugmarke und Sprache. Sie enthält nie Fahrzeugmodell, Symptom, Reisezeitraum, VIN, Kennzeichen, Datei-ID oder gespeicherte Anfrage-ID. Ein Klick auf Suche versendet keine Anfrage an Werkstätten.

Der produktive Server nutzt ausschließlich `public_garage_profile`. Der Ortsreferenzpunkt bleibt vom bestätigten Werkstattpunkt getrennt: Nur ein vorhandener, separat bestätigter Werkstattpunkt darf serverseitig gegen einen Suchort gerechnet werden. Private Mitgliedschaften, Ansprechpartner, Prüfbelege und Kundenanfragen werden nicht gejoint. Nicht veröffentlichte Profile sind aus dem Suchmodell ausgeschlossen.

## Geometrie und Filter

- Radius bedeutet Luftlinie in Kilometern. PostgreSQL verwendet `ST_DWithin` und `ST_Distance` auf bestätigten Werkstattpunkten als `geography`; die lokale Entwicklungsimplementierung verwendet dieselbe Großkreis-Definition. Eine Ortszuordnung oder Unternehmensprüfung ersetzt nie diesen Punkt.
- Mehrere Orte sind eine ODER-Vereinigung. Ein Betrieb im Überlappungsbereich wird anhand seiner stabilen Garage-ID einmal ausgegeben.
- Die angezeigte Entfernung gehört zum nächstliegenden passenden Suchort und benennt diesen Ort ausdrücklich. Ein Treffer am Radiusrand zählt; außerhalb folgt keine automatische Erweiterung. Fehlt die Standortbestätigung, ist ein Betrieb nur ohne Radius auffindbar und die Oberfläche zeigt ausschließlich seinen Werkstattort, nie `0 km` als Ersatz.
- Leistung ist ein harter, gepflegter Katalogfilter. Bei einer Fahrzeugmarke bleibt eine Werkstatt ohne eingeschränkte Markenliste als **markenoffen** auffindbar. Eine ausdrücklich abweichende Markenliste wird ausgeschlossen.
- Der Sprachfilter ist optional und nur eine exakte, gross-/kleinschreibungsunabhängige Sprachübereinstimmung; keine Annahme über Sprachkenntnisse.

Die Suchreferenz ist der mit GeoNames belegte Ortsdatensatz aus #9. Die Werkstattposition wird getrennt erfasst und eine Änderung nimmt ihre Bestätigung zurück; bestehende Ortsmittelpunkte werden nie migriert oder automatisch bestätigt. Kartenanbieter sind optional. Wenn sie fehlen oder ausfallen, bleibt die Liste mit Luftlinienentfernung nutzbar.

## Organische Reihenfolge und Erklärungen

Nach den harten Filtern ist die Standardreihenfolge vollständig deterministisch:

1. direkte Übereinstimmung der optional ausgewählten Fahrzeugmarke (+15; markenoffen bleibt neutral),
2. vollständig dokumentierte Unternehmensdatenprüfung (+5; keine Reparaturqualitätsgarantie),
3. ausgewählte Sprache (+2),
4. kürzere Luftlinie,
5. Name und stabile ID als Gleichstandauflösung.

Die angezeigten Gründe entsprechen nur diesen Merkmalen: Leistung, gegebenenfalls Marke oder Markenoffenheit, Sprache, Unternehmensdatenprüfung und Entfernung. Es gibt absichtlich kein Feld für Abo, Zahlung, Klicks, Provision oder Moderationsdruck.

Bewertungen aus #14 erscheinen erst nach unabhängiger Moderation und privater Nachweisprüfung.
Die Suche zeigt nur daraus abgeleitete Anzahl, Durchschnitt, neuesten Besuchsmonat und historische
Nachweisbasis; Nachweisdateien, Autoren, Moderationsnotizen und Werkstattantworten bleiben außen
vor. Ein einzelner 5,0-Wert erhält keinen Bonus. Erst ab zwei überprüften veröffentlichten Besuchen
kann der Wert als auf vier Punkte begrenzter Gleichstandsentscheider wirken. Bezahlung, Abo,
Werkstattbestätigung oder Moderationsdruck haben kein Rankingfeld. Neue Betriebe bleiben unabhängig
davon auffindbar. Details stehen in [REVIEWS.md](REVIEWS.md).

Die sichtbare Sortierung arbeitet ausschließlich serverseitig: **Empfohlen** nutzt die oben
dokumentierte Standardreihenfolge. **Beste Bewertungsbasis** vergleicht zuerst nur die
veröffentlichte, unabhängig überprüfte Bewertungsbasis und fällt danach auf dieselbe
Standardreihenfolge zurück. Fehlende Basis oder ein einzelner Ausreißer werden nicht über eine
breitere Basis gestellt. Der Query-Parameter `sort` akzeptiert nur `recommended` und
`rating`; Preis, bezahlte Platzierung, Favoriten und Benachrichtigungen bleiben ausgeschlossen.

## Fehler- und Leerzustände

Ungültige oder unvollständige Filter erhalten einen Fehler statt einer stillen Ausweitung. Bei null Treffern schlägt die Oberfläche vor, Leistung, Ort oder den bewusst gewählten Radius anzupassen. Ein Kartenfehler unterbricht weder Ergebnisliste noch Pagination und wird als Kartenfehler angezeigt, nicht als fehlende Werkstätten.

Anfrage und Suche verwenden denselben Ort-/Radius-Formularbaustein. Eine leere Ortsliste (`areas: []`) bedeutet ausdrücklich ganz Kosovo und wird privat ohne Ortszeilen gespeichert. Der gemeinsame Suchübergang erzeugt dann `all=true` plus die gewählte Leistung; Orts- und Datumsfehler sind getrennt. Vorhandene nichtleere Listen behalten ihre individuellen Radien.
