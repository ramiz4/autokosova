# Gespräche und Pilotentscheidung

Status: **Annahmenbasis für die Grundlagenphase beschlossen; reale Validierung vor öffentlichem Pilot offen.** Dieses Dokument enthält keine Interviewergebnisse. Es darf erst nach tatsächlichen Gesprächen mit anonymisierten, sachlichen Notizen ergänzt werden.

## Ziel und Schutzrahmen

Die Gespräche prüfen, ob die beschriebene Zielgruppe einen nachvollziehbaren Nutzen in Suche, Profilen und selbst gewähltem Direktkontakt sieht und ob Werkstätten ein faires, nicht manipulierendes Modell akzeptieren. Sie sind keine Marktstudie und keine Zustimmung zu einem öffentlichen Pilot, Preis oder Vertrag.

- Vor Gesprächsbeginn Zweck, freiwillige Teilnahme und Notizform erklären. Keine Tonaufzeichnung ohne ausdrückliche Zustimmung.
- Im Repository nur Kürzel, grobe Segmentmerkmale und zusammengefasste Erkenntnisse speichern. Keine Namen, Telefonnummern, E-Mail-Adressen, exakten Reisezeiten, Fahrzeugidentifikationsnummern oder Belege ablegen.
- Keine Werkstatt als geprüft, empfohlen oder teilnehmend darstellen, solange es dafür keinen separaten Nachweis und eine Freigabe gibt.
- Keine Person zu Kontakt, Preis oder Aussage drängen. Ein Gespräch kann jederzeit ohne Begründung beendet werden.

## Beschlossene Annahmen für die Grundlagenphase

Der Betreiber hat entschieden, die folgenden Annahmen nach bestem Wissen als Grundlage für UX und Architektur zu verwenden, statt jetzt Interviews durchzuführen. Jede Annahme bleibt bis zur realen Pilotvalidierung offen. Sie autorisiert keine öffentliche Bereitstellung, Kosten oder die Darstellung von Marktresultaten.

| Annahme | Arbeitsentscheidung | Unsicherheit und spätere Prüfung |
|---|---|---|
| Zielgruppe | Primär Menschen aus der albanischen Diaspora, die einen Aufenthalt im Kosovo für Wartung oder Reparatur nutzen und eine Werkstatt selbst auswählen möchten. | Bedarf, Suchvolumen und bevorzugte Sprache sind nicht gemessen. Vor öffentlichem Pilot mit echten Nutzern prüfen. |
| Nutzenversprechen | Orientierung über Leistung, Standort, Unternehmensdaten und nachvollziehbare Erfahrungen ist wertvoller als ein Preisvergleich oder eine Angebotsauktion. | Nicht durch Kunden belegt; kein Qualitäts- oder Erfolgsversprechen daraus ableiten. |
| Kernablauf | Gastzugang: Suche nach Leistung und Ort → Ergebnisse → Profil → bewusst gewählter WhatsApp- oder Telefonkontakt. | Die Verständlichkeit von Mehrort-/Radiussuche, Texten und Kontaktweg wird mit echten Nutzern geprüft. |
| Startgebiet | Pristina und ein klar kommunizierter Luftlinienradius sind der erste sinnvolle Fokus, weil ein dichteres Angebot die Profil- und Suchgrundlage vereinfacht. | Keine bestätigte Partner- oder Nachfragebasis. Erweiterung erst nach Pilotdaten. |
| Werkstattaufnahme | Zunächst betreut und einzeln geprüft; Selbstregistrierung darf keine Kontrolle über einen bestehenden Betrieb verleihen. | Aufwand, Prüfungskriterien und Akzeptanz sind noch offen. |
| Monetarisierung | Suche und Basisprofile bleiben kostenlos. In der Grundlagenphase gibt es kein Abo, keine Werbung und keine Zahlungsabwicklung. | Ob Werkstätten später für zusätzliche Werkzeuge zahlen würden, ist unbekannt. |
| Erfolgsmessung | Relevante Suche, bewusst gewählte Kontaktabsicht, bestätigter Besuch, Profilabdeckung und Moderationsaufwand werden getrennt erfasst. | Kontaktabsicht ist keine Nachricht, Buchung, Besuch oder Umsatz. |

Diese Annahmen geben [Issue #5](https://github.com/ramiz4/autokosova/issues/5) und [Issue #6](https://github.com/ramiz4/autokosova/issues/6) eine gemeinsame, ausdrücklich vorläufige Arbeitsgrundlage.

## Rekrutierungsplan

Vor einem öffentlichen Pilot werden mindestens fünf Gespräche je Gruppe geführt. Die kleine, gezielte Stichprobe dient dem Verständnis und ist nicht repräsentativ. Diese spätere Validierung gehört zu [Issue #18](https://github.com/ramiz4/autokosova/issues/18); sie ist kein Blocker für die jetzige Grundlagenarbeit.

| Gruppe | Gewünschte Vielfalt | Rekrutierung | Nicht zulässig |
|---|---|---|---|
| Diaspora-Kunden | Wohnland oder Region, Reiseerfahrung, Anlass der Reparatur, bisheriger Suchweg | Persönliche Kontakte, Vereine oder passende lokale Gruppen nach ausdrücklicher Ansprache | Scraping von Profilen, Veröffentlichung persönlicher Reisedaten oder fingierte Interessenten |
| Werkstätten | Region, Betriebsgröße, Spezialisierung, bisheriger Kundenkontakt | Direkte, einzeln abgestimmte Ansprache oder vorhandene professionelle Kontakte | Massenversand, irreführende Pilotzusage oder Veröffentlichung nicht bestätigter Unternehmensdaten |

Der Betreiber organisiert oder autorisiert die Ansprache. Für jedes Gespräch wird vorab nur ein anonymes Kürzel vergeben, etwa `K-01` oder `W-01`.

## Leitfaden für Diaspora-Kunden

1. Wann und wie suchen Sie heute in Kosovo nach einer Werkstatt?
2. Welche Informationen helfen Ihnen bei der Auswahl, und welchen Informationen vertrauen Sie nicht?
3. Wie wichtig sind Leistung, Fahrzeugbezug, Lage, Erfahrungen und direkte Kontaktmöglichkeit?
4. Würden Sie ein Suchgebiet mit einem oder mehreren Orten und Radien verstehen und nutzen? Was wäre daran unklar?
5. Was müsste ein Werkstattprofil zeigen, damit Sie bewusst anrufen oder per WhatsApp schreiben würden?
6. Welche Angaben zu Reisezeitraum oder Fahrzeug wären für die Suche hilfreich, aber zu privat für eine Veröffentlichung?
7. Was müsste vorliegen, damit Sie nach einem tatsächlichen Besuch eine Bewertung abgeben möchten?
8. Was würde Sie vom Nutzen der Plattform abhalten?

Nicht fragen: nach vollständiger Anschrift, Kennzeichen, Fahrzeugidentifikationsnummer, Details zu laufenden Reparaturen oder einer Zusage, die Plattform später zu verwenden.

## Leitfaden für Werkstätten

1. Wie werden Sie heute von Kunden gefunden und kontaktiert, insbesondere von Reisenden oder Diaspora-Kunden?
2. Welche Profilangaben, Leistungen und Kontaktwege können Sie korrekt und dauerhaft pflegen?
3. Welche Erwartungen oder Risiken sehen Sie bei öffentlich sichtbaren, reparaturbezogenen Bewertungen?
4. Welche Unternehmensdaten können Sie für eine Prüfung bereitstellen, ohne dass daraus eine Qualitätsgarantie entsteht?
5. Welchen Nutzen hätte ein kostenloses, auffindbares Basisprofil für Sie?
6. Welche zusätzlichen Werkzeuge wären gegebenenfalls nützlich, ohne organische Reihenfolge, Bewertungen oder Nachweise zu kaufen?
7. Wie würde ein optionales Abo mit klarer Leistung, einfachem Kündigungsweg und ohne Erfolgsprovision beurteilt? Erst danach kann ein möglicher Preisbereich besprochen werden.
8. Was würde eine Teilnahme verhindern oder einen Pilot unvertretbar machen?

Klarstellen: Eine Teilnahme ist keine Zusage auf Aufträge, Ranking oder positive Bewertungen. Ein Preiswert wie 29 EUR/Monat ist nur eine Hypothese und wird nicht als Tarif angeboten.

## Anonymes Ergebnisraster

| Kürzel | Gruppe | Grobes Segment | Gesprächsdatum | Beobachtung oder Zitat in eigenen Worten | Relevanz für Produktentscheidung | Offene Frage | Status |
|---|---|---|---|---|---|---|---|
| K-01 bis K-05 | Diaspora-Kunde | Zum Beispiel Wohnregion und Sucherfahrung, ohne Identität | Nach Durchführung | Erst nach tatsächlichem Gespräch | Erst nach tatsächlichem Gespräch | Erst nach tatsächlichem Gespräch | geplant |
| W-01 bis W-05 | Werkstatt | Zum Beispiel Region und Spezialisierung, ohne Firmenname | Nach Durchführung | Erst nach tatsächlichem Gespräch | Erst nach tatsächlichem Gespräch | Erst nach tatsächlichem Gespräch | geplant |

Die Auswertung trennt danach ausdrücklich:

- **Bestätigt:** Übereinstimmende, tatsächlich dokumentierte Beobachtung aus den Gesprächen.
- **Vorschlag:** Konkrete, noch nicht bestätigte Produkt- oder Prozessidee.
- **Offene Annahme:** Frage ohne ausreichende Evidenz oder mit widersprüchlichen Antworten.

Einzelmeinungen, insbesondere zur Zahlungsbereitschaft, werden nicht verallgemeinert. Preis- und Umsatzzahlen werden nur mit Herkunft, Kontext und Unsicherheit dokumentiert; keine dieser Daten gehören in öffentliche Produkttexte.

## Öffentlicher Pilot: spätere Kriterien und Entscheidung

**Vorläufig verantwortliche Person:** Betreiber (Ramiz), vor Pilotbeginn ausdrücklich zu bestätigen.

| Bereich | Vor dem Pilot schriftlich klären | Weiter nur, wenn | Stoppen oder verschieben, wenn |
|---|---|---|---|
| Nutzen | Welches Kundenproblem und welcher Werkstattnutzen geprüft werden | Die Gespräche einen verständlichen, nicht nur behaupteten Nutzen zeigen | Weder Kunden noch Werkstätten einen konkreten Nutzen erkennen lassen |
| Schutz und Fairness | Umgang mit privaten Reise-, Fahrzeug- und Bewertungsdaten; keine käuflichen Vertrauenssignale | Datenschutz, Moderation und direkter Kontakt ohne unerwünschte Verteilung beschreibbar sind | Eine relevante Schutz-, Sicherheits- oder Rechtsfrage ungeklärt bleibt |
| Betrieb | Pilotregion, Partner, Ansprechpartner, Budget, Support und Beschwerdeweg | Ein verantwortbarer, begrenzter Betrieb möglich ist | Verantwortlichkeit, Budget oder Beschwerdeweg fehlen |
| Messung | Definition und Erfassung von relevanten Suchen, Kontaktabsicht, bestätigtem Besuch, Profilabdeckung und Moderationsaufwand | Die Messung keine Buchung oder Umsatz behauptet, die nicht belegt sind | Die zentrale Wirkung nicht datensparsam messbar ist |

Die abschließende Entscheidung lautet **weiter**, **anpassen** oder **stoppen/verschieben** und nennt die zugrunde liegenden anonymen Erkenntnisse, offene Risiken und den Entscheidenden. Sie wird nicht allein aus der Mindestzahl von zehn Gesprächen abgeleitet. Ohne diese Prüfung bleibt es bei der Grundlagenarbeit und einem nicht öffentlichen, kostenfreien Entwicklungsstand.
