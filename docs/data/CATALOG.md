# Kataloggrundlage

Die Startdaten sind bewusst klein: acht Reparaturkategorien, acht gängige Marken und sieben Kosovo-Orte. IDs bleiben stabil; Kategorien, Marken und Orte werden nicht gelöscht, sondern bei einer späteren Ablösung mit `retired_at` markiert. Fahrzeugmodelle bleiben validierter Freitext, ohne VIN- oder Kennzeichenpflicht.

## Ortsquelle und Lizenz

Die Ortsdaten stammen aus dem GeoNames-Länderauszug `XK.zip`, am 13. September 2026 geprüft. GeoNames stellt seine Daten unter einer Creative-Commons-Attribution-Lizenz bereit. Jeder gespeicherte Ort enthält GeoNames-ID, Quelle, Lizenz, Prüfdatum, WGS84-Koordinate und Such-Aliase. Die Seed-Koordinaten stammen aus diesem Auszug, nicht aus dem UX-Showcase oder MapTiler-Geocoding.

- Quelle: <https://download.geonames.org/export/dump/XK.zip>
- Lizenzhinweis: <https://www.geonames.org/export/> und <https://www.geonames.org/about.html>

## Pflegevertrag

- `scripts/db/seed.mjs` ist idempotent und aktualisiert nur denselben stabilen Schlüssel.
- Eine Erweiterung ergänzt neue IDs. Vorhandene IDs dürfen nicht auf einen anderen fachlichen Ort oder eine andere Kategorie umgedeutet werden.
- Such-Aliase behandeln Diakritika und verbreitete Alternativen, etwa `Prishtinë`, `Prishtina` und `Pristina`.
- Vor einem Ausbau ist Quelle, Lizenz, räumlicher Bezug und die Auswirkung auf frühere Anfragen zu dokumentieren.
