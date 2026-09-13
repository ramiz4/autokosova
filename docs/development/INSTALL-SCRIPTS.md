# Installationsskripte für die lokale Toolchain

Für #49 am 13.09.2026 an den durch `package-lock.json` aufgelösten Paketen geprüft.
Node 24.21.0 und npm 11.19.0 werden lokal und in CI gemeinsam verwendet.

| Paket | Entscheidung | Geprüfter Zweck |
|---|---|---|
| `esbuild@0.28.2` | Versionsgebunden erlaubt | `install.js` prüft die Plattform-Binary und Version und optimiert den lokalen Aufruf. Bei fehlendem optionalem Plattformpaket kann es die passende Version aus npm nachladen; dieser Pfad prüft den erwarteten Binary-Hash. |
| `@parcel/watcher@2.6.0` | Installationsskript abgelehnt | `scripts/build-from-source.js` startet nur bei explizitem Build-from-source `node-gyp`. Unterstützte Plattformen verwenden das optionale vorkompilierte Paket. |
| `fsevents@2.3.3` | Installationsskript abgelehnt | Das macOS-Paket liefert `fsevents.node` bereits aus; kein lokaler Neubau für den dokumentierten Einstieg erforderlich. |
| `lmdb@3.5.6` | Installationsskript abgelehnt | `node-gyp-build-optional-packages` prüft native Pakete und versucht bei Fehlern einen lokalen Neubau. Für die unterstützten Plattformen werden die optionalen vorkompilierten Pakete verwendet. |
| `msgpackr-extract@3.0.4` | Installationsskript abgelehnt | Derselbe optionale native Build-Pfad; kein automatischer lokaler Neubau erforderlich. |

Geprüft wurden die jeweiligen `package.json`-Einträge, der esbuild-Installer, das
Parcel-Buildscript und `node-gyp-build-optional-packages/bin.js`. Die Ablehnung eines
Installationsskripts entfernt kein Paket und ist keine Aussage, dass das Paket schädlich ist.

`.npmrc` erzwingt die Prüfung bislang unbewerteter Skripte. Bei Abhängigkeitsupdates die
neuen aufgelösten Versionen/Skripte prüfen und Freigaben gezielt aktualisieren. Eine
esbuild-Versionsänderung braucht eine neue versionsgebundene Freigabe. Unterstützte
Plattformen werden durch tatsächlichen Build und Entwicklungsstart auf macOS/Apple Silicon
und Linux geprüft. Neue Plattformen oder Source-Builds brauchen eine eigene Prüfung.

Referenz: [npm install-scripts](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/).
