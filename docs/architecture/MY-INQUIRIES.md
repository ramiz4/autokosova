# Meine Anfragen

Issue #71 adds `/inquiries`, `/sq/inquiries` and `/en/inquiries`. `/inquiry` remains the
creation flow. The shared signed-in account menu links to the overview; the public
navigation and the separately planned Favorites page are unchanged.

## Data and authorization

`GET /api/me/repair-requests?limit=20&cursor=<last-id>` returns `requests` and a nullable
`nextCursor`. The default limit is 20, the maximum is 50. Only `limit` and `cursor` are
accepted, never a user/owner parameter. The existing session supplies the owner. The
AccessStore and PostgreSQL store implement the same method over the existing requests.

Ordering is `created_at DESC, id DESC`. A cursor must identify one of the current
owner's requests. PostgreSQL resolves the timestamp in SQL rather than round-tripping
it through JavaScript Date, preserving microseconds. Anchor validation and page reads
share a read-only repeatable-read transaction. An unavailable or foreign anchor gets
the same 404; the UI offers a fresh overview. Migration 071 adds the supporting index.

Summaries whitelist service, a maximum 160-character symptom preview, search areas,
save timestamp and optional class/make/model/year. No travel dates, attachment IDs, owner IDs,
engine details or document storage keys are returned in the list. Detail reads reuse
`GET /api/me/repair-requests/:repairRequestId` with the same ownership check. Vehicle
reads also bind their SQL query to the owner. An admin role does not widen either read.
Sessions are rechecked after asynchronous store operations. Unexpected store errors
return a generic 503 rather than logging or serializing private database values.

## Browser and privacy boundaries

The page-scoped service uses credentialed same-origin fetch with `cache: no-store` only
in the browser after session validation. It has no localStorage/sessionStorage or
TransferState persistence and never reads or writes RepairRequestDraft. All outstanding
reads are aborted and data cleared on destruction and session changes. Responses check
the exact captured identity, generation and abort signal both before and after JSON
parsing. Computed view data additionally fences account changes before effects execute.

The account page helper applies `private, no-store`, `Vary: Cookie`, `no-referrer` and
`noindex, nofollow` to HTML as well as private API responses. The page is excluded from
robots/sitemap and performs no analytics calls. Request IDs are redacted from the request
logger's detail path. Safe login returns permit only the explicit localized overview
paths and reject external URLs, query-bearing overview targets and fragments.

The readonly expansion shows actual saved data and attachment count, not public file
links. Public search URLs use the existing `buildRepairRequestSearchParams` with only
service/places/radii. Neither viewing nor searching overwrites a local creation draft.
There is no new editing/deletion workflow and no message, booking, quote or order state.

## Verification

Added server/API and PostgreSQL tests exercise ownership, real POST-to-list persistence,
pagination, stale/foreign cursors, expiry during reads, sanitized errors and private
headers. Angular tests cover page/service/menu/routing behavior, malformed and late
responses, locale changes and preservation of a local draft. Browser fixtures cover
DE/SQ/EN, 1280px desktop and 360/390/430px mobile, focus/menu/navigation, private details,
error/retry and safe search URLs; they use fictitious account/API data, not a login bypass
in the application. The dedicated browser workflow stores screenshots as CI artifacts.

The PR records commands actually executed and their results. Browser fixtures and an
in-process test session are not evidence of a real ZITADEL sign-in. Acceptance with the
approved local test-OIDC accounts remains a separate manual check; this change does not
modify provider configuration, use production accounts or deploy publicly.
