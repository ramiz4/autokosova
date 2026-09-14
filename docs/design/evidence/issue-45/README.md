# Werkstattprofil: lokaler Vergleich für #45

Vergleich vom 14.09.2026 mit
[Screenshot 4](../../references/2026-09-13/mockups/04-werkstattprofil.png). Alle sichtbaren
Betriebe, Bewertungen, Telefonnummern und Bilder sind ausdrücklich gekennzeichnete lokale
Demo-Daten. Es gab keine öffentliche Bereitstellung und keinen externen Kontaktversuch.

| Ansicht                     | Nachweis                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| Profil, Desktop 1448 × 1086 | [Über uns](profile-desktop-1448.webp)                            |
| Profil, Desktop 1280        | [Leistungen](profile-services-1280.webp)                         |
| Profil, Mobil 430           | [Bewertungen und Kontaktleiste](profile-reviews-mobile-430.webp) |
| Tastaturbedienbare Galerie  | [Vollbild](profile-gallery-1448.webp)                            |

Die flache Profilseite übernimmt die Hierarchie der Vorlage, verwendet aber nur tatsächlich
veröffentlichte Daten. Gründungsjahr, Teamgröße, Kundenperson, Reparaturversprechen und fremde
Logos wurden nicht aus dem Mockup übernommen. Demo-Profile verwenden ein veröffentlichtes
Galeriebild als Profilbild; reale Profile ohne eigenes Logo erhalten weiterhin einen neutralen
Initialenplatzhalter.

Der Profilkopf bleibt am Desktop gemeinsam mit Favorit und Kontaktaktion sticky unter der
Top-Navigation. Der dadurch doppelte blaue Kontaktkasten entfällt. Bewertung und Standort stehen
in einer Zeile; Prüf-Icon und Status-Badge sind getrennte Elemente. Mobil bleibt die kompakte
Kontaktleiste am unteren Rand erreichbar.

Es gibt keine Tab-Leiste. Über uns und Bewertungen folgen links als natürlicher Lesefluss;
Leistungen, Marken und Standort bleiben rechts sticky in den drei einheitlichen hellen Info-Cards
sichtbar. Fotos werden nur oben gezeigt. Die Anker `#reviews`, `#services`, `#makes`, `#location`
und `#photos` bleiben direkt adressierbar.

## Browserprüfung

- 1448 × 1086 und 1280 × 900: kein horizontaler Überlauf; Profilbild, getrennte Prüfung,
  Bewertungs-/Standortzeile und der zweizeilige Kontakt-CTA sichtbar.
- 360, 390 und 430 px: kein horizontaler Überlauf; gestapelte Inhalte und feste Kontaktaktion ohne
  verdeckte Endinhalte. DE, SQ und EN enthielten keine unübersetzten Schlüssel.
- Galerie: Öffnen, Pfeil-rechts, Escape und Fokusrückgabe zum ersten Bild erfolgreich.
- Gastfavorit: keine private `/api/me/`-Anfrage und keine 401-Antwort; Anmeldelink bewahrt nur
  erlaubte öffentliche Parameter.
- Teilen: kanonische Profil-URL ohne Orts-, Leistungs- oder private Parameter; kopierbarer Fallback
  bei fehlender Web-Share-Schnittstelle.

Die vier optimierten Demo-Bilder stammen aus den vom Nutzer bereitgestellten, versionierten
[Designreferenzen](../../references/2026-09-13/README.md). Sie bleiben als Konzeptmaterial
gekennzeichnet und belegen keinen realen Betrieb, keine Marke und keine Leistung.
