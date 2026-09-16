# Profil & Einstellungen: visueller Nachweis für #174

Die Aufnahmen stammen vom lokalen Worktree und verwenden ausschließlich synthetische Kontodaten (`Fiktives Werkstattkonto`, `@example.invalid`, Fixture-IDs). Es wurden keine echten Nutzer- oder Werkstattdaten verwendet.

| Ansicht | Nachweis |
| --- | --- |
| Desktop 1280 × 900 | [Profil & Einstellungen](profile-desktop-1280.webp) |
| Mobil 390 × 844 | [Profil & Einstellungen](profile-mobile-390.webp) |

Zusätzlich automatisiert im Chromium-Browser geprüft: 1536 px Desktop sowie 360, 390 und 430 px mobile Breite, lange synthetische Konto-/Garage-Werte, mindestens 44 px große Copy-/Sprachziele, 2:1-Spaltenverhältnis ab Desktop, kein horizontaler Überlauf, Tastatur-Erreichbarkeit von Copy/Schnellzugriff/Sprache/Logout und bestätigter Clipboard-Schreibvorgang.

Die 200%-Zoom-Anforderung wurde zusätzlich als 1280 physische Pixel → 640 CSS-Pixel bei `deviceScaleFactor: 2` geprüft; `scrollWidth` und `clientWidth` blieben beide 640 px. Die Referenzabweichungen sind beabsichtigt: keine Profilbearbeitung, kein Avatar-Upload/Kamera-Button, kein erfundener Aktivstatus und keine Social-Media-Links. Garage-Mitgliedschaften bleiben ohne erfundenes Detailziel nicht klickbar.
