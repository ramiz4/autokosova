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
eine Variable `ZITADEL_POST_LOGOUT_URI` wird nicht unterstützt und soll nicht angelegt werden.

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
