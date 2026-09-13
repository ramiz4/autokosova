# Öffentliche Suche und Matching

Stand: 13. September 2026. Diese Regeln setzen #12 um und ergänzen [ADR-001](ADR-001.md) sowie das [Datenmodell](DATA-MODEL.md).

## Daten- und Schutzgrenze

Die öffentliche Suchanfrage enthält ausschließlich eine Leistung, einen bis drei Orts-IDs mit jeweils 5–100 km Radius sowie optionale Fahrzeugmarke und Sprache. Sie enthält nie Fahrzeugmodell, Symptom, Reisezeitraum, VIN, Kennzeichen, Datei-ID oder gespeicherte Anfrage-ID. Ein Klick auf Suche versendet keine Anfrage an Werkstätten.

Der produktive Server nutzt ausschließlich `public_workshop_profile` und die daraus abgeleiteten Ortsreferenzpunkte. Private Mitgliedschaften, Ansprechpartner, Prüfbelege und Kundenanfragen werden nicht gejoint. Nicht veröffentlichte Profile sind aus dem Suchmodell ausgeschlossen.

## Geometrie und Filter

- Radius bedeutet Luftlinie in Kilometern. PostgreSQL verwendet `ST_DWithin` und `ST_Distance` auf `geography`; die lokale Entwicklungsimplementierung verwendet dieselbe Großkreis-Definition.
- Mehrere Orte sind eine ODER-Vereinigung. Ein Betrieb im Überlappungsbereich wird anhand seiner stabilen Workshop-ID einmal ausgegeben.
- Die angezeigte Entfernung gehört zum nächstliegenden passenden Suchort und benennt diesen Ort ausdrücklich. Ein Treffer am Radiusrand zählt; außerhalb folgt keine automatische Erweiterung.
- Leistung ist ein harter, gepflegter Katalogfilter. Bei einer Fahrzeugmarke bleibt eine Werkstatt ohne eingeschränkte Markenliste als **markenoffen** auffindbar. Eine ausdrücklich abweichende Markenliste wird ausgeschlossen.
- Der Sprachfilter ist optional und nur eine exakte, gross-/kleinschreibungsunabhängige Sprachübereinstimmung; keine Annahme über Sprachkenntnisse.

Die aktuelle Standortreferenz ist der mit GeoNames belegte Ortsdatensatz aus #9, nicht eine behauptete exakte Werkstattadresse, Fahrzeit oder Verfügbarkeit. Kartenanbieter sind optional. Wenn sie fehlen oder ausfallen, bleibt die Liste mit Luftlinienentfernung nutzbar.

## Organische Reihenfolge und Erklärungen

Nach den harten Filtern ist die Reihenfolge vollständig deterministisch:

1. direkte Übereinstimmung der optional ausgewählten Fahrzeugmarke (+15; markenoffen bleibt neutral),
2. vollständig dokumentierte Unternehmensdatenprüfung (+5; keine Reparaturqualitätsgarantie),
3. ausgewählte Sprache (+2),
4. kürzere Luftlinie,
5. Name und stabile ID als Gleichstandauflösung.

Die angezeigten Gründe entsprechen nur diesen Merkmalen: Leistung, gegebenenfalls Marke oder Markenoffenheit, Sprache, Unternehmensdatenprüfung und Entfernung. Es gibt absichtlich kein Feld für Abo, Zahlung, Klicks, Provision oder Moderationsdruck.

Bewertungen existieren erst mit #14. Bis dahin zeigt jedes Ergebnis ehrlich **„Noch keine Bewertungen“**. Die spätere Bewertungsergänzung muss Anzahl, Aktualität, fachlichen Bezug und Nachweisstatus in einer eigenen, dokumentierten Vertrauensregel berücksichtigen: Eine einzelne 5,0 darf eine größere aktuelle relevante Erfahrungsbasis nicht blind überstimmen. Neue Betriebe bleiben unabhängig davon auffindbar.

## Fehler- und Leerzustände

Ungültige oder unvollständige Filter erhalten einen Fehler statt einer stillen Ausweitung. Bei null Treffern schlägt die Oberfläche vor, Leistung, Ort oder den bewusst gewählten Radius anzupassen. Ein Kartenfehler unterbricht weder Ergebnisliste noch Pagination und wird als Kartenfehler angezeigt, nicht als fehlende Werkstätten.
