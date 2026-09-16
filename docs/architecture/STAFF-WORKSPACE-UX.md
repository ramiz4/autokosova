# Aufgabenorientierter interner Arbeitsplatz

Admin und Moderation benutzen eine gemeinsame Shell und die vorhandenen Fachprozesse. Die Darstellung ordnet Arbeit, erteilt aber keine Rolle, Fallzuweisung oder Objektberechtigung. Die kanonischen Regeln bleiben in [Rollen und Berechtigungen](ROLES-AND-PERMISSIONS.md).

## Navigation und Lebensdauer

`/admin` zeigt handlungsbereite Fälle, `/moderation` die eigenen zugewiesenen Fälle. `todo`, `waiting` und `done` sind Ansichten über bestehende Zustände, keine neue Statusmaschine. Bearbeiter, Priorität, Fallart, Widerspruch und Seitenzahl sind begrenzte Filter. Adminzähler benutzen dieselben serverseitigen Prädikate wie ihre Direktziele; leere Zähler dominieren den Einstieg nicht.

Fall-IDs stehen in `/admin/cases/:caseId` beziehungsweise `/moderation/cases/:caseId`. Werkstattaufgaben führen unmittelbar zu `/admin/garages?garageId=…&tab=review`, Datenschutzaufgaben zu `/admin/privacy?requestId=…`. Die Sprachpräfixe `/sq` und `/en` bleiben erhalten. Alte Verwaltungsbereiche bleiben erreichbar; unterstützte Werkstattaufnahme ist eine Aktion im Werkstattbereich.

Nur technische IDs, feste Filter und Seitenzahlen gehören in Navigationsparameter. Private Suche, Freitexte, Gründe, Belege und Grants werden weder dort noch in neuem Browserstorage gespeichert. Zurücknavigation erhält Filter, Seite und den objektbezogenen Rückkehrfokus im Arbeitsspeicher. Ein neu geladener oder sprachlich gewechselter Detailpfad autorisiert den Gegenstand erneut; private Entwürfe werden nicht über Reloads persistiert.

## Prüfung vor Entscheidung

Eine Bewertung zeigt Inhalt und bewusst geöffneten Nachweis nebeneinander, soweit die Breite es erlaubt. Die drei Prüfpunkte sind vor der Aktionswahl sichtbar und nie vorausgewählt. Veröffentlichung bleibt an alle drei positiven Prüfungen und verfügbaren Nachweis gebunden. Ablehnung fragt ihren eigenen Grund ab. Rückfrage setzt den bestehenden Wartezustand; sie ist keine Behauptung über eine versendete Nachricht. Ausgangsentscheidung und Widerspruch stehen vor den Entscheidungsaktionen; eigene Beteiligung erlaubt nur den unabhängigen Übergabeweg.

Übernahme und Zuweisung verlassen den Fall nicht. Eine erfolgreiche Mutation wird durch eine neue berechtigte Detailabfrage bestätigt. Erst nach dem sichtbaren Ergebnis kann ausdrücklich der nächste weiterhin zulässige Fall geöffnet werden. Weder die Navigation noch die Ergebnisanzeige trifft weitere Entscheidungen.

Werkstätten öffnen standardmäßig die Prüfung. Die vier Prüffelder sind unmittelbar sichtbar. Teilprüfung speichern ist eine sekundäre Möglichkeit, keine Voraussetzung für die Veröffentlichung. Geänderte Prüfung/Position und Veröffentlichung gehen in einem einzigen revisionsgeprüften Aufruf durch den vorhandenen Domainwriter und dessen Transaktion. Ein veröffentlichter Unternehmensstatus ersetzt keine Fotoentscheidung.

Fotos, Team/Eigentum und dokumentierter Support sind eigene Detailbereiche. Gründe stehen bei ihrer Aktion. Das Kontofeld sucht nur vorhandene aktive zulässige Konten; Tastaturauswahl bleibt explizit. Eigentumsübergabe zeigt bisherigen und neuen Eigentümer sowie die fortbestehende Bearbeiterrolle. Letzter Eigentümer, Eigeninteresse, gelöschte Profile und private Kundendaten bleiben serverseitig geschützt. Benutzerzuordnungen verlinken unmittelbar zur Werkstatt; lokaler Sitzungswiderruf steht unter Sicherheitsaktionen.

Löschaufträge stehen vor der Policykonfiguration. Angezeigte Policyversion, Eigentumsblocker und betroffene Objektarten/Anzahlen bilden den begrenzten Entscheidungskontext. Der Eigentumslink führt in den Teamkontext und zurück zum ausgewählten Auftrag. Kein Aufruf erzeugt eine Betreiberfreigabe. Ausstehende physische Dateilöschung bleibt getrennt vom abgeschlossenen Datenbankvorgang.

## Konflikte und Entwürfe

Tatsächliche Änderungen erhalten Verwerfenschutz. Lesen, Filter und gleiche, rein darstellende Detailbereiche brauchen keine zusätzliche Bestätigung. Ein `409` erhält die Eingaben und sperrt weitere Mutationen, bis der aktuelle Serverstand bewusst neu gelesen wurde. Es gibt keine automatische Wiederholung mit einer ausgetauschten Revision. Erfolgszustände werden nicht aus einem fehlgeschlagenen nachgelagerten Read abgeleitet.

Logout, Kontowechsel oder bekannter Rechteentzug invalidieren den privaten Datenkontext und verspätete Antworten. Laufende Schreibvorgänge bleiben gegen Doppelklick geschützt. Die bestehende Bestätigung öffentlich wirksamer oder destruktiver Aktionen bleibt erhalten; keine nachgebauten unzugänglichen Modal-Dialoge werden eingeführt.

## Reproduzierbarer Vorher-/Nachher-Walkthrough

Die Vergleichsbasis ist `e5404b76d035902ed4661cbb705e73556ee1ba64`, der im UX-Auftrag untersuchte Stand. `scripts/staff-workspace-ux-evidence.mts` führt beide Checkouts mit deren Abhängigkeiten, signierendem synthetischem OIDC und einer jeweils neu angelegten zufälligen lokalen Testdatenbank aus. Es verändert keine vorhandene Demo-/Produktivdatenbank und benötigt keinen Reset. Dateiinhalte sind ausschließlich die vorhandenen fiktiven Fixtures.

| Szenario                   | Vorher beobachteter Bedienweg                                                                 | Neuer Bedienweg / konkreter Nachweis                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bewertung veröffentlichen  | Fall öffnen, Nachweis öffnen, Aktion wählen, drei Kontrollen, generisch speichern, bestätigen | Fall öffnen, Nachweis öffnen, drei Kontrollen, benannte Veröffentlichung, bestätigen: eine vorgelagerte Aktionsauswahl entfällt.                                  |
| Bewertung ablehnen         | Aktionsauswahl und generischer Speicherschritt                                                | Benannte Ablehnung, passender Grund, benannte finale Entscheidung; keine erzwungenen positiven Nachweishäkchen. Es wird keine pauschale Klickersparnis behauptet. |
| Nachweis fehlt/entzogen    | Entscheidungsmöglichkeiten erst aus dem Formular ableiten                                     | Fehlenden Nachweis am Objekt erklären; Veröffentlichung gesperrt, zulässige Ablehnung/Rückfrage bleibt erreichbar.                                                |
| Unabhängiger Widerspruch   | Ausgang und Verlauf waren räumlich von den Aktionen getrennt                                  | Ausgangsentscheidung, Grund und Widerspruch vor der Aktion; eigene Vorentscheidung nur über unabhängigen Übergabeweg.                                             |
| Admin übernimmt einen Fall | Öffnen → übernehmen → Listenrücksprung → denselben Fall erneut öffnen                         | Öffnen → übernehmen → im aktualisierten Fall weiterarbeiten: ein erzwungener Kontextwechsel und ein erneutes Öffnen entfallen.                                    |
| Werkstatt veröffentlichen  | Teilprüfung und Veröffentlichung wirkten als aufeinanderfolgende Aufgaben                     | Vier Prüfungen und Veröffentlichung ohne vorheriges Speichern: Browserprüfung zählt genau einen `/decision`-POST und keinen `/verification`-POST.                 |
| Eigentum übertragen        | Suche, separater Suchbutton, separates Auswahlfeld und entferntes Grundfeld                   | Ein suchbares Kontofeld mit expliziter Auswahl, sichtbarer Vorher-/Nachher-Folge und einer Bestätigung.                                                           |
| Blockierter Löschauftrag   | Policyverwaltung vor Aufträgen; kein unmittelbarer Eigentumskontext                           | Auftrag → betroffene Werkstatt/Team → derselbe Auftrag; Version/Blocker erneut prüfen, kein scheinbarer Abschluss physischer Löschung.                            |

Diese Zählung beschreibt konkrete UI-Schritte beziehungsweise HTTP-Schreibaufrufe, keine gemessene Bearbeitungszeit, Produktiv-Prozentverbesserung oder Studie mit echten Mitarbeitenden. Auswahl eines Werts zählt als fachliche Auswahl, nicht als geräteabhängige Zahl einzelner Tastenanschläge. Login und Scrollgesten werden nicht in eine vermeintliche Gesamtklickzahl eingerechnet.

Der bestehende Workflow `.github/workflows/staff.yml` veröffentlicht die Bilder und `metrics.json` im Artifact `staff-foundation-evidence`: `staff-workspace-ux/before/` und `staff-workspace-ux/after/`. Beide Seiten enthalten DE/SQ/EN-Startansichten bei 1280×900 und 390×844 sowie die genannten Kernansichten. Nachher wird zusätzlich 320-CSS-Pixel-Reflow geprüft. Das ist ein Layoutnachweis, keine Behauptung über eine bestimmte Browser-Zoom-Oberfläche. Die aktuelle erste Aufgabe samt Öffnen-Aktion muss im ersten Viewport liegen, ohne horizontalen Overflow; der primäre Öffnen-Touchbereich muss mindestens 44 CSS-Pixel hoch sein.

## Regression

Die normalen README-/CI-Kommandos gelten weiter: Formatierung, Lint, App-/E2E-Typprüfung, Entwicklungswerkzeuge, Angular-, Server-/Nichtbesitzer-PostgreSQL-Tests, Build und Smoke. Die vollständige E2E-Inventarliste verlangt alle Fälle jeweils auf Desktop und Mobil, ohne Retries oder erzwungene Klicks. `admin-context`, `staff-context` und `privacy-context` ergänzen die bestehenden Verwaltungs-/Review-/Kunden-/Werkstattabläufe. Der eigenständige Staff-Browserlauf prüft weiter Moderation und Zugriffsgrenzen. Tatsächlich ausgeführte Ergebnisse und der geprüfte Commit stehen im Implementierungs-PR und seinen CI-Läufen, nicht in einer manuell synchronisierten Ticketkopie.
