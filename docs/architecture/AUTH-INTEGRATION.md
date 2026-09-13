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

## Was die Tests beweisen

Die Berechtigungstests erzeugen ausschließlich im Speicher Sitzungen mit zufälligen Test-IDs. Dieser Test-Store ist kein Login-Endpoint und keine lokale Ersatz-Authentifizierung. Er prüft Cookie-/CSRF-Grenzen, Ablauf, Abmeldung, Besitz, Membership, Rolleneskalation und private Dateifreigaben ohne Konto oder Token eines echten Menschen.

## Lokaler Integrationsnachweis

Die EU-Testinstanz und die PKCE-Webanwendung sind außerhalb des Repositories eingerichtet. Issuer, JWKS-URI, Client-ID und die lokalen Redirect-URIs liegen im 1Password-Eintrag `AutoKosova ZITADEL EU admin`, nicht in Git. Der echte lokale Durchlauf wurde mit `/auth/login` → ZITADEL → `/auth/callback` und einem anschließend autorisierten privaten API-Request geprüft.

## Weiterhin offene Produktivgates

Die Free-Testinstanz verwendet Development Mode und ausschließlich `localhost`-Redirects. Vor einer öffentlichen Bereitstellung braucht es eine separat freigegebene Produktivinstanz beziehungsweise Anwendung mit HTTPS-Redirect, DPA-/Budgetprüfung und einen erneuten Login-/Logout-Test. Eine Passwortzurücksetzung wird im ZITADEL-Login gehostet; der lokale `/auth/recovery`-Endpoint verrät aus Datenschutzgründen nicht, ob ein Konto existiert.
