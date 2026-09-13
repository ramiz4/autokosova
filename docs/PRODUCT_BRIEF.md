# AutoKosova · Produktbrief

Stand: 13. September 2026. Grundlage sind Anforderungen des Projektinitiators, keine bereits durchgeführte Marktvalidierung.

## Entscheidungsstatus

| Art | Stand |
|---|---|
| Bestätigt durch den Projektinitiator | Orientierung und selbst gewählter Direktkontakt statt Angebotsauktion; Qualität und nachvollziehbare Erfahrungen vor Preis; Suche und Profile ohne Konto; Deutsch und Albanisch im MVP. |
| Zu prüfender Vorschlag | Ein kostenloses Basisprofil für Werkstätten und ein mögliches Pro-Abo für zusätzliche Werkzeuge nach nachweislichem Nutzen. |
| Offene Annahmen | Tatsächlicher Bedarf, bevorzugter Such- und Kontaktweg, geeignete Pilotregion und -partner, Zahlungsbereitschaft, Budget, Betreiber/Sitz sowie Anbieter und Stack. |

Der Status wird erst nach echten Gesprächen aktualisiert. Die Vorbereitung und das Ergebnisraster stehen in [INTERVIEWS.md](validation/INTERVIEWS.md); dort werden keine unnötigen personenbezogenen Daten abgelegt.

## Arbeitsentscheid für die Grundlagenphase

Der Betreiber hat entschieden, die Grundlagenphase ohne zeitaufwendige Einzelinterviews fortzusetzen. Die dokumentierten Annahmen in [INTERVIEWS.md](validation/INTERVIEWS.md) sind deshalb die Arbeitsgrundlage für UX und Architektur. Sie sind keine Marktvalidierung und erlauben weder einen öffentlichen Pilot noch eine kostenpflichtige Leistung. Reale Gespräche und die Go/No-Go-Entscheidung gehören vor den öffentlichen Pilot in [Issue #18](https://github.com/ramiz4/autokosova/issues/18).

## Problem und Zielgruppe

Nach Beschreibung des Initiators möchte die albanische Diaspora aus Deutschland, der Schweiz und weiteren Ländern während Aufenthalten in Kosovo Reparaturen und Wartungen durchführen lassen. Qualität ist wichtiger als der billigste Preis; für gute Arbeit besteht nach seiner Einschätzung Zahlungsbereitschaft. Es fehlen leicht zugängliche, verlässliche Informationen zur Auswahl passender Werkstätten. Vorhandene Alternativen und tatsächliche Nachfrage werden im Pilot geprüft; nicht pauschal behaupten, nirgendwo existierten Bewertungen.

## Wertversprechen

**Finde eine passende Werkstatt in Kosovo – anhand nachvollziehbarer Kundenerfahrungen statt auf gut Glück.**

Zuerst Auswahl und Vertrauen digitalisieren, nicht den gesamten Werkstattprozess. Eine Reparaturanfrage ist persönlicher Suchkontext, keine öffentliche Ausschreibung und kein Reparaturauftrag. Werkstätten müssen sich weder bewerben noch Angebote schreiben.

## Zwei Kundenwege

Direkt: Landing Page → Leistung/Ort → Ergebnisse → Werkstattprofil → bewusst gewählter WhatsApp-/Telefonkontakt.

Detailliert: Fahrzeug → Problem/gewünschte Arbeit → Ort(e)/Radius/Reisezeitraum → passende Werkstätten → Profil → Direktkontakt.

Danach: tatsächlicher Werkstattbesuch → privater Besuchsnachweis → Prüfung → reparaturbezogene Bewertung. Kontaktklick beweist weder gesendete Nachricht noch Besuch. Werkstattbestätigung ist nicht die einzige Nachweismöglichkeit.

## MVP

Mobiloptimierte Web-App auf Deutsch und Albanisch. Kundensuche, Profile und ausgewählter Kontakt ohne Konto; Registrierung zum dauerhaften Speichern von Fahrzeugen/Anfragen, Bewerten und zur Werkstattverwaltung. Selbstregistrierung und betreute Werkstattaufnahme. Kleine Administration für Unternehmensdaten, Besuchsnachweise, Meldungen und Datenlöschung.

Suche kombiniert Leistung, Fahrzeugbezug, Standort und relevante Erfahrungen. Ein Ort mit Luftlinienradius oder Vereinigung mehrerer Orte mit jeweils eigenem Radius. Betrieb im Überlappungsbereich nur einmal anzeigen. Reise-/Abholdaten dienen der direkten Abstimmung, nicht einer behaupteten Live-Verfügbarkeit.

Bewertungen zeigen Arbeit, optionalen Fahrzeugbezug, Anzahl, Aktualität und Nachweisstatus. Neue Betriebe bleiben mit ehrlichem Leerzustand auffindbar. Kritik darf nicht durch verweigerte Werkstattbestätigung blockiert werden. Sterne und Unternehmensprüfung sind keine technische Qualitätsgarantie.

## Nicht im MVP

Angebotsauktion, Lead-Bewerbungen, vollwertiger Chat, WhatsApp-Business-Integration, automatische Terminbuchung, Reparaturpreisrechner, KI-Diagnose, Escrow, Zahlungsabwicklung, Versicherungs-/Finanzprodukte, native Apps und Werkstatt-ERP.

## Erfolgsmessung

Primär: Anteil relevanter Suchvorgänge mit bewusst gewählter Kontaktabsicht; keine Buchungsquote. Sekundär: kundenbestätigte Kontakte/Besuche, Zahl und Aussagekraft geprüfter Erfahrungen, Suchabdeckung, Moderationsaufwand und Werkstatt-Zahlungsbereitschaft.

Hohe Conversion ist eine Hypothese. Noch keine gemessene Ausgangsrate und kein belegtes Erfolgsversprechen. Keine Fake-Kunden, Scheinbewertungen oder künstliche Knappheit einsetzen.

## Pilotentscheidung

Vor einem öffentlichen Pilot hält der Betreiber schriftlich fest, wer verantwortlich ist, welche Region und Partner einbezogen werden, welches Budget verfügbar ist und wie Beschwerden sowie private Nachweise bearbeitet werden. Die Entscheidung folgt dem in [INTERVIEWS.md](validation/INTERVIEWS.md) festgelegten Raster:

- **Weiter:** Zielgruppe und Werkstätten sehen einen verständlichen, verantwortbaren Nutzen; es gibt keine ungelöste Sicherheits-, Datenschutz- oder Betriebsbarriere.
- **Anpassen:** Nutzen oder Ablauf ist unklar, aber die Gespräche zeigen einen konkret eingrenzbaren und prüfbaren nächsten Ansatz.
- **Stoppen/verschieben:** Es gibt keinen belastbaren Nutzen, keine verantwortbare Betreibergrundlage oder eine nicht aufgelöste Schutz- beziehungsweise Rechtsfrage.

Fünf Kunden- und fünf Werkstattgespräche sind eine Mindestgrundlage für die spätere öffentliche Pilotentscheidung in [Issue #18](https://github.com/ramiz4/autokosova/issues/18), aber keine repräsentative Marktstudie. Ein Kontaktklick bleibt eine Kontaktabsicht, nicht ein gesendeter Auftrag, Besuch oder Umsatz.

## Offene Entscheidungen

Pilotregion und reale Partner; rechtlicher Betreiber/Sitz; Budget; Hosting-, Auth-, Karten-, Speicher- und E-Mail-Anbieter; konkreter Stack; Prüf-/Aufbewahrungsregeln und Preistest. [Issue #4](https://github.com/ramiz4/autokosova/issues/4) konkretisiert Produkt/Monetarisierung, [#6](https://github.com/ramiz4/autokosova/issues/6) Architektur und Anbieter. Kostenpflichtige Bestellungen und öffentlicher Launch sind nicht freigegeben.
