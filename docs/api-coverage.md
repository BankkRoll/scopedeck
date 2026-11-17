# API coverage

Scopedeck uses the HackerOne Hacker API at `https://api.hackerone.com/v1/hackers`. This page lists
every endpoint the app calls, and every task it hands off to hackerone.com because the API has no
endpoint for it.

## Implemented

| Endpoint                                                  | Used for                                                                                                                | Rate-limit bucket |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `GET /programs`                                           | Program list; a one-item page also verifies credentials at sign-in                                                      | read              |
| `GET /programs/{handle}`                                  | Program detail and policy                                                                                               | read              |
| `GET /programs/{handle}/structured_scopes`                | Scope. Incremental syncs use `filter[updated_at__gt]`; large scopes page past the 10,000-item cap with `filter[id__gt]` | structured scopes |
| `GET /programs/{handle}/scope_exclusions`                 | Exclusions checklist in the composer                                                                                    | read              |
| `GET /programs/{handle}/weaknesses`                       | Weakness picker and finding import                                                                                      | read              |
| `GET /me/reports`                                         | Reports inbox and change notifications                                                                                  | read              |
| `GET /reports/{id}`                                       | Report detail and activity timeline                                                                                     | read              |
| `POST /reports`                                           | Direct submission                                                                                                       | write             |
| `GET /report_intents`                                     | Intents list                                                                                                            | read              |
| `GET /report_intents/{id}`                                | Intent status polling                                                                                                   | read              |
| `POST /report_intents`                                    | Intent submission path                                                                                                  | write             |
| `PATCH /report_intents/{id}`                              | Updating an intent's description                                                                                        | write             |
| `DELETE /report_intents/{id}`                             | Discarding an intent                                                                                                    | write             |
| `POST /report_intents/{id}/submit`                        | Turning a ready intent into a report                                                                                    | write             |
| `GET /report_intents/{id}/attachments`                    | Intent attachments                                                                                                      | read              |
| `POST /report_intents/{id}/attachments`                   | Uploading draft attachments (`files[]`, multipart)                                                                      | write             |
| `DELETE /report_intents/{id}/attachments/{attachment_id}` | Removing an attachment                                                                                                  | write             |
| `GET /hacktivity`                                         | Hacktivity search                                                                                                       | read              |
| `GET /payments/balance`                                   | Earnings balance                                                                                                        | read              |
| `GET /payments/earnings`                                  | Earnings history and charts                                                                                             | read              |
| `GET /payments/payouts`                                   | Payout history                                                                                                          | read              |

Rate limits are enforced client-side with a sliding window per bucket (reads 600 per minute,
writes 25 per 20 seconds, structured scopes 50 per minute) so the app waits instead of drawing a 429. If the server still returns 429 or a transient 5xx, requests retry with full-jitter backoff
and honour `Retry-After`. `POST` requests are never retried after a 5xx, because the server may
have acted on them.

Every endpoint has tests against a mock server covering the success path and the 401, 403, 404,
422, 429 and 5xx responses. No test calls the live API.

## Linked out to hackerone.com

These open in the system browser. Paths are defined in
[`src/domain/deep-links.ts`](../src/domain/deep-links.ts), and the app refuses to open any URL
outside `hackerone.com`, `docs.hackerone.com` and `api.hackerone.com`.

| Task                                         | Opens                                          | Source                                |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------- |
| Create or rotate an API token                | `/settings/api_token/edit`                     | Hacker API getting-started docs       |
| Payment method setup                         | `/settings/rewards_and_payments/payment_setup` | HackerOne docs, payment setup article |
| Account settings                             | `/settings/account`                            | Not documented; unverified            |
| Two-factor authentication                    | `/settings/authentication/edit`                | Not documented; unverified            |
| Reply to, close or otherwise act on a report | `/reports/{id}`                                | Report URLs returned by the API       |
| Program page                                 | `/{handle}`                                    | Program URLs returned by the API      |
| Full program scope                           | `/{handle}/policy_scopes`                      | Program scope tab on hackerone.com    |
| Public profile                               | `/{username}`                                  | Profile URLs on hackerone.com         |
| Hacktivity in the browser                    | `/hacktivity`                                  | hackerone.com navigation              |

The two unverified rows are the most likely to move. If one of them breaks, update
`deep-links.ts` and this table in the same change.

## Not covered

The Hacker API has no endpoints for posting comments on a report, changing report state,
managing your profile, or reading private messages. Scopedeck links to the report page for
these instead of scraping or automating the website.
