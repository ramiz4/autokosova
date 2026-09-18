# Werkstattbearbeitung ohne unbeabsichtigten Datenverlust

Die Aufnahme und Bearbeitung unter `/garages/new`, `/sq/garages/new` und
`/en/garages/new` vergleichen alle Formularwerte mit dem zuletzt erfolgreich geladenen
oder gespeicherten Stand. Auch einzelne Telefon-, Sprach- oder Leistungsänderungen sowie
die Einwilligung eines neuen Entwurfs zählen als ungespeicherte Arbeit.

Interne Navigation, Profilwechsel, Neuladen eines Profils und Zurücksetzen verwenden
dieselbe Verwerfungsbestätigung in DE/SQ/EN. Ein leeres oder unverändertes Formular
fragt nicht nach. Während Speichern oder Laden sind diese Aktionen gesperrt.
Für Browser-Neuladen, vollständige Seitennavigation und Schliessen registriert die
Komponente `beforeunload`; ob und mit welchem Standardtext der Browser die Warnung
anzeigt, entscheidet der Browser. Nach Zerstören der Komponente bleibt kein Listener.

Ein fehlgeschlagenes Laden oder Speichern verwirft keine Eingaben. Erst ein bestätigter
Speichererfolg setzt den Vergleichsstand zurück. Beim Einreichen zur Prüfung werden
laufende Ladevorgänge und ungültige Statusübergänge abgefangen. Eine 401-/403-Antwort
zeigt den bestehenden Wiederanmeldehinweis, ohne einen erfolgreichen Antrag vorzutäuschen.
Serverseitige Authentifizierung, CSRF und Membership-Prüfungen bleiben unverändert.

Es entsteht keine zusätzliche Speicherung privater Entwürfe in Browserstorage, URLs,
Logs oder SSR. Dies ist ein Schutz vor versehentlichem Verlassen, kein automatisches
Backup: bewusst bestätigtes Verwerfen, Browserabsturz oder Gerätausfall bleiben Grenzen.

## Regression und vollständige Demodaten

`src/app/garage-onboarding.navigation.spec.ts` ergänzt die bestehenden Komponententests
um einzelne Feldänderungen, Einwilligung, lokalisierte Routengrenzen, Browser-Unload,
Listener-Bereinigung, laufende Requests, Fehlererholung und Prüfstatusübergänge.
Die bestehende CI prüft zusätzlich Kundenanfragen, Rechte, Demo-Seeds und isolierten
Entwicklungsstart; ihre Ergebnisse müssen für den jeweiligen Commit geprüft werden.

Der lokale Einstieg mit sämtlichen vorhandenen fiktiven Demo- und Workflowdaten lautet:

```sh
npm ci
npm run dev:demo
```

Voraussetzungen und sichere Worktree-Isolation stehen in der README. Kein Reset ist
für diesen Einstieg erforderlich. Für private Kunden- und Werkstattabläufe ist weiterhin
die freigegebene Test-ZITADEL-Konfiguration samt Testkonten erforderlich; Demodaten
sind kein Login-Bypass. Ein erfolgreicher CI-Test ersetzt weder den Start auf dem
Entwicklungsrechner noch die Abnahme am echten Testprovider oder die Pilotfreigabe.
