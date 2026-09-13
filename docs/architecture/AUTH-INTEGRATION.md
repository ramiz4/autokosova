# ZITADEL-Integration und lokale Testgrenze

AutoKosova verwaltet keine Passwörter. Eine produktive Sitzung darf erst entstehen, nachdem ZITADEL einen OIDC-Token verifiziert hat. `src/server/oidc.ts` prüft dazu Signatur, Issuer, Audience und Subject gegen die konfigurierte JWKS-URL.

## Erforderliche Konfiguration vor einem echten Login

| Variable | Zweck |
|---|---|
| `ZITADEL_ISSUER` | Exakter Issuer der EU-Instanz. |
| `ZITADEL_AUDIENCE` | Für AutoKosova registrierte API-Audience. |
| `ZITADEL_JWKS_URI` | JWKS-Endpunkt derselben Instanz. |

Die ZITADEL-Anwendung benötigt einen Authorization-Code-Flow mit PKCE, eine registrierte lokale Redirect-URL für Entwicklung und später eine separat freigegebene Produktions-Redirect-URL. Secrets, Client-IDs und echte Domains gehören nicht in Git.

## Was die Tests beweisen

Die Berechtigungstests erzeugen ausschließlich im Speicher Sitzungen mit zufälligen Test-IDs. Dieser Test-Store ist kein Login-Endpoint und keine lokale Ersatz-Authentifizierung. Er prüft Cookie-/CSRF-Grenzen, Ablauf, Abmeldung, Besitz, Membership, Rolleneskalation und private Dateifreigaben ohne Konto oder Token eines echten Menschen.

## Offenes externes Gate

Ein echter ZITADEL-Login-, Logout- und Wiederherstellungsdurchlauf erfordert eine vom Betreiber angelegte EU-Instanz, eine Anwendung und konfigurierte Redirect-URLs. Bis dahin bleiben alle produktiven Authentifizierungswege geschlossen; die Gastsuche bleibt erreichbar. Dieses Gate ist vor einer öffentlichen Bereitstellung zu erfüllen und wird nicht durch die lokalen Tests als erledigt dargestellt.
