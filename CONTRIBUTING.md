# Contributing

Thanks for helping. Bug reports, fixes and focused features are all welcome. For anything larger
than a small fix, open an issue first so we can agree on the approach before you spend time on it.

## Setup

You need Node 22 (`.nvmrc`), pnpm 10 and the Rust toolchain in `rust-toolchain.toml`. On Linux,
install the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/#linux).

```sh
pnpm install
pnpm tauri dev
```

To work on the UI without a HackerOne account, run `pnpm dev:e2e` and open the printed URL. That
mode swaps the Rust core for the in-memory backend in `src/testing/mock-backend.ts`. Sign in with
any username and the token `valid-token`.

To point the app at a local mock API, set `SCOPEDECK_API_BASE_URL` (only `https` or loopback
URLs are accepted). `SCOPEDECK_LOG=scopedeck_lib=debug` turns up logging; the token is redacted at
every level.

## Checks

CI runs all of these on Linux, macOS and Windows and fails on any warning. Run them before
pushing:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:e2e         # first run: pnpm exec playwright install chromium

pnpm rust:fmt
pnpm rust:lint
pnpm rust:test
```

Tests never call the live API. Rust HTTP tests use wiremock; frontend tests use the mock backend.
A new endpoint needs a success test and the shared error-mapping test
(`assert_maps_error_statuses`).

If you change `findingSchema` in `src/domain/finding-import.ts`, regenerate the published schema
with `pnpm test -u` and commit `docs/finding-schema.json`.

## Code style

- TypeScript is strict. No `any` and no non-null assertions.
- Rust denies `clippy::all`. A pedantic lint may be allowed on a single item with a `reason`.
  No `unwrap` or `expect` outside tests.
- Comments explain why, not what. If the code already says it, leave the comment out.
- The UI uses the tokens in `src/styles/globals.css`: neutral surfaces, one accent colour, 1px
  borders, no gradients or shadows. Match the existing screens.
- Every web view request goes through a Rust command. Do not add plugin permissions to
  `capabilities/main.json`; call the plugin from Rust instead.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
`refactor:`, `test:`, `chore:`, `ci:`), one logical change per commit. Explain why in the body
when the diff does not make it obvious.

Pull requests should describe the change, link the issue, and include a screenshot for UI
changes. Keep them small enough to review in one sitting.

By contributing you agree that your work is released under the [MIT License](LICENSE) and that
you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
