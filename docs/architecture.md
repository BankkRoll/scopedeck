# Architecture

Scopedeck is a Tauri 2 app. A Rust core owns credentials, networking and storage; a React web
view renders the UI and talks to the core only through named commands.

```
┌──────────────────────── web view (React) ─────────────────────────┐
│ features/*  →  query/* (TanStack Query)  →  ipc/* (Zod-validated) │
└───────────────────────────────┬───────────────────────────────────┘
                     invoke("command", args) │ events: reports-updated, …
┌───────────────────────────────┴──────────────── Rust core ────────┐
│ commands/*  →  sync.rs  →  api/* (reqwest)  →  api.hackerone.com  │
│      │            │                                               │
│      │            └──→  cache/* (SQLite + FTS5)                    │
│      └──→ state.rs  →  credentials.rs (OS keychain)                │
│ background.rs (periodic report sync, notifications)               │
│ redaction.rs + logging.rs (every log line passes through)         │
└───────────────────────────────────────────────────────────────────┘
```

## Trust boundary

The web view is treated as untrusted. It renders Markdown from the API, so it must not be able to
leak or misuse anything if a sanitizer bug ever lets script through.

- **Capabilities.** [`capabilities/main.json`](../src-tauri/capabilities/main.json) grants only
  `core:event:allow-listen` and `core:event:allow-unlisten`. No plugin is reachable from
  JavaScript; dialogs, the opener, notifications and the updater are called from Rust.
- **Commands never return the token.** Commands that need the API take the client from
  `AppState`. `ApiToken` has a redacted `Debug` impl and no `Serialize` impl; the only type
  that serializes the token is the private record written to the keychain.
- **No file paths from the UI.** Attachments and exports go through Rust-side pickers. The UI
  receives opaque attachment ids, and the path behind each id stays in the core.
- **External links.** `open_external` accepts only `https` URLs on `hackerone.com`,
  `docs.hackerone.com` and `api.hackerone.com`.
- **CSP.** `default-src 'self'`, no remote scripts and `connect-src` limited to Tauri IPC.
  `style-src` allows inline styles because CodeMirror injects them at runtime.

## Rust core

[`src-tauri/src`](../src-tauri/src)

| Module              | Responsibility                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `api/client.rs`     | Basic-auth client, percent-encoded paths, pagination that refuses `links.next` on another origin, multipart uploads              |
| `api/rate_limit.rs` | Sliding-window limiter per bucket (read, write, structured scopes)                                                               |
| `api/retry.rs`      | Full-jitter backoff, `Retry-After` as seconds or HTTP date; non-idempotent requests are not retried on 5xx                       |
| `api/error.rs`      | `ApiError`, a tagged enum mapped from status codes and JSON:API error bodies                                                     |
| `api/*.rs`          | One module per resource: DTOs and endpoint functions                                                                             |
| `credentials.rs`    | `CredentialStore` trait with a keychain implementation and an in-memory one for tests                                            |
| `cache/`            | SQLite in WAL mode, versioned migrations, an FTS5 index over programs and assets, drafts, templates, saved searches and settings |
| `sync.rs`           | Fetches from the API and writes into the cache; detects scope and report changes                                                 |
| `background.rs`     | Periodic report sync, change events and opt-in notifications                                                                     |
| `redaction.rs`      | Registry of secret strings and a `MakeWriter` that scrubs them from every log line                                               |
| `commands/`         | Thin Tauri command handlers; errors become a tagged `CommandError` the UI can switch on                                          |

`leak_tests.rs` signs in against a mock server, exercises the commands at trace-level logging, and
asserts the token and the base64 `Authorization` value appear in none of: raw logs, redacted logs,
command responses, or the SQLite files on disk.

## Data flow: stale-while-revalidate

Each synced resource has two commands, `*_cached` and `*_sync`. The UI runs both as separate
queries:

1. `*_cached` reads SQLite and returns `{ data, syncedAt }` immediately, so screens render
   offline and on cold start.
2. `*_sync` fetches from the API, writes the cache, and returns the fresh value, which the hook
   writes into the cached query's data.

The status bar shows the last sync time and whether the device is offline. A failed sync leaves the
cached data on screen with an inline error.

Scope syncs are incremental (`filter[updated_at__gt]` since the last sync) with a full refresh
every six hours to pick up deletions. Assets that changed in the latest sync get a "new" badge.

## Submitting a report

The composer supports two paths. Which one is offered depends on the program, and the app
remembers when a program rejects intents.

- **Direct.** `report_preview` returns the exact JSON body `report_submit` will send. The review
  dialog shows that body and requires an explicit confirmation before `POST /reports`.
- **Intent.** The draft becomes a report intent, attachments are uploaded, and the app polls the
  intent until it settles. Submitting a ready intent needs the same confirmation.

Drafts autosave to SQLite 400 ms after the last edit.

## Frontend

[`src`](../src)

| Directory     | Responsibility                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ipc/`        | One typed wrapper per command. Every response is parsed with Zod before use.                                                       |
| `domain/`     | Pure logic with unit tests: Hacktivity query compiler, scope matching, finding import, draft validation, earnings aggregation, CSV |
| `query/`      | Query keys and the stale-while-revalidate hook                                                                                     |
| `features/`   | One directory per screen                                                                                                           |
| `components/` | Shared UI: data table, Markdown renderer and editor, primitives in `ui/`                                                           |
| `testing/`    | Fixtures and a mock IPC backend used by unit and end-to-end tests                                                                  |

Routing uses hash history because the app is served from the bundle, not a web server.

## Tests

| Layer          | Tool                                 | What it covers                                                                       |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Rust unit      | `cargo test`                         | DTO parsing, retry and rate-limit timing, cache queries, sync change detection       |
| Rust HTTP      | `cargo test` with wiremock           | Every endpoint's success path and error mapping                                      |
| Secret leakage | `cargo test leak_tests`              | Token absent from logs, responses and the database                                   |
| Frontend unit  | Vitest and Testing Library           | Domain logic and the published finding schema                                        |
| End to end     | Playwright against `vite --mode e2e` | Onboarding, browsing, composing and submitting, import, reports, Hacktivity, palette |

The e2e mode replaces Tauri IPC with an in-memory backend
([`src/testing/mock-backend.ts`](../src/testing/mock-backend.ts)), so no test reaches the
network.
