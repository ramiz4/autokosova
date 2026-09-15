# ZITADEL-Integration und lokale Testgrenze

AutoKosova verwaltet keine Passwörter. Eine produktive Sitzung darf erst entstehen, nachdem ZITADEL einen OIDC-Token verifiziert hat. `src/server/oidc.ts` prüft dazu Signatur, Issuer, Audience und Subject gegen die konfigurierte JWKS-URL.

## Erforderliche Konfiguration vor einem echten Login

| Variable | Zweck |
|---|---|
| `ZITADEL_ISSUER` | Exakter Issuer der EU-Instanz. |
| `ZITADEL_CLIENT_ID` und `ZITADEL_AUDIENCE` | Client-ID der registrierten PKCE-Webanwendung; sie ist zugleich die erwartete ID-Token-Audience. |
| `ZITADEL_JWKS_URI` | JWKS-Endpunkt derselben Instanz. |
| `ZITADEL_AUTHORIZATION_ENDPOINT` und `ZITADEL_TOKEN_ENDPOINT` | OIDC-Endpunkte aus der Discovery-Dokumentation derselben Instanz. |
| `ZITADEL_REDIRECT_URI` | Genau eine in ZITADEL registrierte Callback-URL. |

Die ZITADEL-Anwendung benötigt einen Authorization-Code-Flow mit PKCE, eine registrierte lokale Redirect-URL für Entwicklung und später eine separat freigegebene Produktions-Redirect-URL. Secrets, Client-IDs und echte Domains gehören nicht in Git.

## Lokale Ports, Dateien und 1Password

Angular läuft mit `npm start` und standardmäßig auch mit `npm run dev:demo` unter
`http://localhost:4200/`. Dazu gehört der registrierte Callback
`http://localhost:4200/auth/callback`. Der separat gebaute SSR-Server läuft über
`npm run start:ssr` standardmäßig auf Port 4000 (`PORT`); das ist ein anderer Startmodus.

Für einen weiteren Worktree `AUTOKOSOVA_APP_PORT` ausdrücklich in dessen `.env.local`
setzen. Ein echter OIDC-Login benötigt dann eine passende, bereits freigegebene Callback-URL.
Der Entwicklungsstarter ändert keine Anbieterregistrierung. Lokale Callback-/Logout-URLs
sind normale Konfiguration und keine Passwörter. Der Adapter liest `ZITADEL_REDIRECT_URI`;
`ZITADEL_END_SESSION_ENDPOINT` und `ZITADEL_POST_LOGOUT_URI` werden als optionales Paar für den vollständigen Provider-Logout unterstützt (siehe unten).

`.env.example` dokumentiert die erwarteten Namen und enthält keine aktive Teilkonfiguration.
Das auskommentierte 4200-Callback-Beispiel erst zusammen mit den übrigen erforderlichen
OIDC-Werten aktivieren. Ein Kopieren der Vorlage allein aktiviert keinen Login.
Der gemeinsame Loader liest außerhalb von Produktion zuerst `.env`, dann `.env.local`;
vorhandene Prozessvariablen haben Vorrang. Der Starter verwendet bei unvollständiger
OIDC-Konfiguration nur den öffentlichen Gastablauf und nennt den fehlenden Login.
Der direkte Serverstart behält die bestehende Prüfung unvollständiger OIDC-Konfiguration.

Die tatsächlichen instanzspezifischen Werte und Testkonten werden im freigegebenen
1Password-Eintrag gepflegt. Sie werden gezielt als Prozessvariablen oder lokale,
von Git ignorierte `.env.local` bereitgestellt; weder Node noch der Starter fragt
1Password automatisch ab. Testpasswörter bleiben ausschließlich im Secret-Store
und werden nicht als App-Konfiguration hinterlegt. Keine Tokens, Passwörter oder
vollständigen DB-Verbindungsadressen in Terminalausgaben, Issues oder PRs ausgeben.

## Testrollen ohne lokalen Bypass

Alle verifizierten ZITADEL-Subjekte erhalten in AutoKosova mindestens die Rolle `customer`. Die
Serverrolle `admin` oder `moderator` entsteht zusätzlich nur aus dem signatur- und issuer-geprüften
ZITADEL-Claim `urn:zitadel:iam:org:project:roles`; Werte aus Browser, URL, Cookie oder Request-Body
werden nie als Rolle übernommen. Das Testprojekt muss die Rollen im ID-Token ausgeben.

Die nichtproduktiven Testkonten und ihre tatsächlichen Subjects liegen ohne Passwörter oder Tokens im
freigegebenen 1Password-Eintrag. Für die lokale Prüfung werden genau diese fiktiven Rollen benötigt:

- Kunde: private Anfrage und Bewertung;
- Werkstattmitglied: nur die eigene Membership-Ansicht;
- Moderator: nur zugewiesene Moderationsfälle;
- Admin: Memberships und Moderationsentscheidungen.

Ein neuer erfolgreicher OIDC-Login ersetzt zuvor im Prozess gespeicherte erhöhte Rollen desselben
Subjekts durch die im frisch verifizierten Token enthaltenen Rollen. Damit kann ein entferntes
Projektrecht nicht durch einen alten lokalen Rolleneintrag weiterwirken.

## Was die Tests beweisen

Die Berechtigungstests erzeugen ausschließlich im Speicher Sitzungen mit zufälligen Test-IDs. Dieser Test-Store ist kein Login-Endpoint und keine lokale Ersatz-Authentifizierung. Er prüft Cookie-/CSRF-Grenzen, Ablauf, Abmeldung, Besitz, Membership, Rolleneskalation und private Dateifreigaben ohne Konto oder Token eines echten Menschen.

## Lokaler Integrationsnachweis

Die EU-Testinstanz und die PKCE-Webanwendung sind außerhalb des Repositories eingerichtet. Issuer, JWKS-URI, Client-ID und die lokalen Redirect-URIs liegen im 1Password-Eintrag `AutoKosova ZITADEL EU admin`, nicht in Git. Der echte lokale Durchlauf wurde mit `/auth/login` → ZITADEL → `/auth/callback` und einem anschließend autorisierten privaten API-Request geprüft.

## Weiterhin offene Produktivgates

Die Free-Testinstanz verwendet Development Mode und ausschließlich `localhost`-Redirects. Vor einer öffentlichen Bereitstellung braucht es eine separat freigegebene Produktivinstanz beziehungsweise Anwendung mit HTTPS-Redirect, DPA-/Budgetprüfung und einen erneuten Login-/Logout-Test. Eine Passwortzurücksetzung wird im ZITADEL-Login gehostet; der lokale `/auth/recovery`-Endpoint verrät aus Datenschutzgründen nicht, ob ein Konto existiert.

## Vollständige Abmeldung und bewusste erneute Anmeldung (#75)

Ein Login-Klick verwendet jetzt `prompt=login` und `max_age=0`. Der Callback prüft neben
Signatur, Issuer und Audience auch den transaktionsgebundenen `nonce` und `auth_time`:
die aktive Authentifizierung muss nach dem Beginn dieser Login-Transaktion liegen
(Toleranz: 5 Sekunden für Uhrenabweichung). Fehlende/veraltete Zeitangaben scheitern geschlossen.
`prompt=create` bleibt der Registrierungsablauf; das ausdrücklich übergebene
`prompt=select_account` fordert nur Kontoauswahl an, nicht zwingend erneute Authentifizierung.
Andere Prompt-Werte, insbesondere `none`, fallen auf frische Anmeldung zurück.
Passkeys und externe Identitätsanbieter können eine andere Interaktion als ein Passwortformular anbieten.

Für den vollständigen Browser-Logout beide Werte aus zulässiger lokaler Konfiguration setzen:

```dotenv
# Exakten end_session_endpoint aus der Discovery der eigenen Testinstanz übernehmen:
ZITADEL_END_SESSION_ENDPOINT=https://YOUR-TEST-ISSUER/oidc/v1/end_session
ZITADEL_POST_LOGOUT_URI=http://localhost:4200/auth/logout/callback
```

Die Callback-URI muss **zuvor exakt als Post Logout Redirect URI in ZITADEL registriert** sein.
Für andere Worktree-Ports beide App-Callbacks entsprechend registrieren; nichts wird automatisch
beim Provider angelegt. Der Logout-Callback liegt zwingend auf demselben Origin wie der
Login-Callback unter `/auth/logout/callback`, ohne Query/Fragment. Der Endpunkt muss auf dem
konfigurierten Issuer-/Authorization-Origin liegen. HTTPS ist erforderlich, außer explizitem
HTTP-Loopback im nichtproduktiven Testbetrieb. Unvollständige oder unsichere Paare stoppen den
Start mit bereinigter Fehlermeldung. Ohne beide Werte bleibt der öffentliche Start unverändert.

Header und Profil verwenden denselben Ablauf:

1. CSRF-geschütztes `POST /auth/logout?locale=de|sq|en` mit `Accept: application/json`.
   Die App widerruft zuerst die lokale Sitzung und laufende Login-Transaktionen dieses Browsers;
   ein bereits laufender Tokenaustausch wird vor Session-Erstellung erneut auf Widerruf geprüft.
2. Die Antwort enthält ausschließlich einen festen lokalen `redirectTo`, niemals ein ID-Token.
   Der Browser navigiert vollständig zu `/auth/logout/provider`; ein kurzlebiges HttpOnly-Cookie
   bindet diesen einmaligen Handoff an die zuvor autorisierte Abmeldung.
3. Der Browser besucht den konfigurierten End-Session-Endpunkt mit `client_id`, fester Callback-URI,
   Sprache und zufälligem `state`. ZITADEL verwendet seine eigenen Cookies und kann eine
   Logout-Bestätigung anzeigen. Raw-ID-Tokens werden weder aufbewahrt noch als Hint weitergegeben.
4. Nur der passende, browsergebundene, noch gültige State wird einmal akzeptiert. Rückkehr zur
   Startseite `/`, `/sq` oder `/en`; kein erneuter automatischer Login. Der Callback verändert
   keine neuen App-Sitzungen. Ein neuer Login verwirft einen noch ausstehenden Logout-Callback.

Ohne Provider-Logout-Konfiguration zeigt `/auth/logged-out` in DE/SQ/EN ausdrücklich nur die
lokale Abmeldung und erklärt die Grenze. Ein Provider-Ausfall/abgebrochener Redirect hebt den
lokalen Widerruf nicht auf; der nächste Login fordert weiterhin frische Authentifizierung.
Bei abgelaufener App-Sitzung kann der Browser mit passendem Double-Submit-CSRF noch die
Provider-Abmeldung starten. Ohne CSRF gibt es keine Provider-Navigation. API-Clients ohne
JSON-Accept behalten den bisherigen **lokalen** 204-Vertrag, nicht die Behauptung eines SSO-Logout.

Alle Auth-Antworten sind `private, no-store`, `Vary: Cookie`, `no-referrer` und `noindex`.
Transaktionsspeicher sind zeitlich/quantitativ begrenzt und pro Serverprozess, wie bestehende
Sitzungen; mehrere Instanzen benötigen später gemeinsamen Session-/Transaktionsspeicher.
Konfigurationswerte/State/Claims/Cookies werden nicht protokolliert. Provider-Logout ist kein
universeller Logout aus allen föderierten Diensten, Browserprofilen oder Geräten.

### Regressionstest und externe Abnahme

`node scripts/oidc-logout-browser-smoke.mjs` nutzt einen isolierten **zustandsbehafteten**
signierenden OIDC-Testprovider mit eigenem SSO-Cookie und einer expliziten Test-Anmeldemaske.
Das Programm prüft fortbestehende Provider-Sitzung, frische Anmeldung, Browser-End-Session,
Konto A → Logout → Konto B, Header/Profil, Sprachen und Provider-Fehler. Keine Anwendungsantworten
werden ersetzt und kein Login-Bypass in die Runtime eingebaut. Es werden keine Screenshots von
Credentials/Codes/Token-URLs erstellt. Dieser Nachweis ersetzt **nicht** die freigegebene echte
Test-ZITADEL aus #38. Der konkrete lokale Nutzerbrowser/1Password-Eintrag ist hier nicht verfügbar;
die echte Endpunkt-/Redirect-Registrierung und der anschließende reale Login-/Logout-Test bleiben
separat nachzuweisen. Kein öffentliches Deployment oder Provider-Administrationszugriff durch dieses Issue.

Referenzen: [ZITADEL-Endpunkte](https://zitadel.com/docs/apis/openidoauth/endpoints),
[RP-Initiated Logout](https://openid.net/specs/openid-connect-rpinitiated-1_0.html),
[OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest).

## Kontozweck und lokale Demo-Zuordnung (#81)

Die Basisrolle `customer` ist von `accountType` getrennt. Der persistierte Kontozweck
`customer` oder `garage` steuert die Oberfläche, nicht die Objektberechtigung.
Eigene Werkstätten brauchen weiterhin aktive Memberships; Löschen verlangt die
Owner-Rolle. Die Zuordnung lokaler Workflow-Fixtures verwendet ausdrücklich
konfigurierte tatsächliche OIDC-Subjects plus Issuer, nie eine E-Mail-Übereinstimmung.
Einzelheiten: [Demo-Konten und Datenbesitz](../development/DEMO-ACCOUNT-OWNERSHIP.md).
