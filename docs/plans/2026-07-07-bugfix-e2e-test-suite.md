# Bug-fix pass + no-manual-verification test suite (frontend integration in jsdom + Rust unit tests)

## Overview

Two-part effort. First, a focused bug-hunting pass over the frontend stores/hooks and the pure Rust logic, fixing every confirmed bug with a regression test. Second, build a test suite broad enough that you no longer need to click through the app by hand: full user-flow integration tests that render the real `App` component with mocked Tauri `invoke`/`listen` (login → load channels → select channel → send message → threads → reactions → drafts → notifications), plus exhaustive store/hook logic tests and the first-ever Rust unit tests. Everything runs in CI with no Mattermost server (`npm run test`, `cargo test`), which the CI workflow already invokes.

## Context

- Architecture: Tauri 2 desktop app. React/TS frontend calls Rust via `invoke()`; WebSocket/HTTP/storage/keychain live in Rust. Real user-facing behavior is driven by the frontend stores + `useWebSocket` event handlers + `App.tsx` orchestration.
- Test stack already present: Vitest + jsdom + @testing-library/react + user-event. `src/test/setup.ts` mocks `@tauri-apps/api/core` (`invoke`), `@tauri-apps/api/event` (`listen`/`emit`), window, and notifications. Baseline is green (81 tests, 6 files).
- CI already runs both `cargo test` and `npm run test` (`.github/workflows/ci.yml`) plus clippy `-D warnings`, `cargo fmt --check`, `tsc --noEmit`, `npm run lint`. No new CI wiring needed — Rust has zero tests today, so `cargo test` currently passes vacuously.
- Files central to bugs/tests:
  - Frontend logic: `src/hooks/useWebSocket.ts` (663 lines, untested — the biggest gap), `src/stores/uiStore.ts`, `src/stores/threadsStore.ts`, `src/stores/draftsStore.ts`, `src/stores/tabsStore.ts`, `src/stores/reactionsStore.ts`, `src/stores/messagesStore.ts`, `src/App.tsx`.
  - Rust pure logic: `src-tauri/src/mattermost/client.rs` (`new`/`api_url` URL handling), `src-tauri/src/storage/posts_cache.rs` (serialize round-trip), `src-tauri/src/mattermost/events.rs` + `types.rs` (serde defaults).
- Bug candidates already spotted during exploration (to confirm and fix):
  - `client.rs::new` prepends no scheme — a scheme-less URL like `mm.example.com` yields an invalid/misparsed base URL and malformed `api/v4` requests.
  - App cold-start: `notif:navigate-channel` and `check_pending_notification` call `handleSelectChannel` before channels load; `primeLastViewedSnapshot` is skipped and selection can silently no-op.
  - `threadsStore.markThreadRead` orphaned-count heuristic can over-decrement `userThreadsUnread`.
  - `useWebSocket` mention/notify gating (`isMentioned`/`shouldNotify`) and badge-count updates are entirely untested.
- Related patterns: existing tests reset the store in `beforeEach` via `useXStore.setState({...})`, build fixtures with `makePost`-style factories, and assert on `getState()`. Follow this exactly.

## Development Approach

- **Testing approach**: Bug fixes are TDD (write a failing regression test, then fix). New coverage is regular (test existing behavior; where a test reveals a bug, fix it and note it).
- Confirm each suspected bug against the code before "fixing" — if behavior is actually correct, write a characterization test instead of changing code, and record the finding.
- Complete each task fully before the next; all tests green before moving on.
- **CRITICAL: every task MUST include new/updated tests.**
- **CRITICAL: all tests must pass before starting the next task.**
- No new production abstractions unless a fix requires one; no changes to app behavior beyond confirmed bug fixes.

## Implementation Steps

### Task 1: Frontend bug-hunting pass (stores + App orchestration)

**Files:**
- Modify (fixes as confirmed): `src/stores/threadsStore.ts`, `src/App.tsx`, and any store where a bug is confirmed
- Create: `src/test/bugfixes.test.ts` (regression tests, one `describe` per confirmed bug)

- [ ] Audit `threadsStore.markThreadRead` / `incrementThreadUnread` for over/under-decrement of `userThreadsUnread`; write a failing test reproducing the drift, then fix
- [ ] Audit `App.tsx` cold-start notification path (`notif:navigate-channel`, `check_pending_notification`) for selecting a channel before `channels` are loaded; add a guard/retry and a regression test
- [ ] Audit `tabsStore.incrementTabUnread` and `uiStore.incrementChannelUnread`/`clearChannelUnread` for off-by-one / active-channel edge cases; add tests, fix if confirmed
- [ ] For any suspected issue that turns out correct, add a characterization test instead and note it in the test file
- [ ] run `npm run test` — must pass before Task 2

### Task 2: `useWebSocket` event-handler tests (largest untested surface)

**Files:**
- Create: `src/test/useWebSocket.test.ts`
- Modify: `src/hooks/useWebSocket.ts` (only if a handler bug is confirmed)

- [ ] Test `handlePosted`: top-level post adds to channel order; thread reply increments root `reply_count` and routes to open thread vs. followed-thread unread; system messages skip unread/notify
- [ ] Test `isMentioned` / `shouldNotify` matrix: muted channel, `desktop: none/mention/all/default`, `@username`, `@channel/@all/@here`, no current user
- [ ] Test reactions (`handleReactionAdded`/`Removed`): dedup, only-notify-on-my-post, reaction chip updates on post + thread copy
- [ ] Test `handleChannelViewed` / `handleMultipleChannelsViewed`, `handleTyping` (5s timeout via fake timers), `handleDraftUpserted`/`Deleted` newer-wins, `handleOpenDialog` nested-unwrap
- [ ] Fix any confirmed handler bug found while testing
- [ ] run `npm run test` — must pass before Task 3

### Task 3: Remaining store coverage (drafts, reactions, tabs, ui, threads)

**Files:**
- Create: `src/test/draftsStore.test.ts`, `src/test/reactionsStore.test.ts`, `src/test/uiStore.test.ts`
- Modify: `src/test/tabsStore.test.ts`, `src/test/threadsStore.test.ts` (fill gaps)

- [ ] `draftsStore`: set/clear/getDraft, debounced server sync (fake timers), `loadFromServer` server-wins-if-newer merge, persist partialize
- [ ] `reactionsStore`: 200-cap, unread recount, markAllRead/clearAll
- [ ] `uiStore`: channel mention/unread math, favorites toggle, typing add/remove, notify-props merge, sidebar categories
- [ ] Extend `tabsStore`/`threadsStore` tests for close-active-tab activation and following/stub-entry paths
- [ ] run `npm run test` — must pass before Task 4

### Task 4: Full user-flow integration tests (render real `App`)

**Files:**
- Create: `src/test/app.integration.test.tsx`
- Create: `src/test/helpers/tauriMock.ts` (typed `invoke`/event-emit harness: per-command mock responses + a way to fire `listen` callbacks/`channels-loaded`/`ws_event`)

- [ ] Build the mock harness: register `invoke` command handlers, capture `listen` callbacks so tests can emit Tauri events, seed a fake server/team/channel/user dataset
- [ ] Flow: no servers → add-server view; with server + login success → main view renders channels
- [ ] Flow: `channels-loaded` event populates sidebar and auto-selects first public channel; selecting a channel renders MessageList + composer
- [ ] Flow: incoming `ws_event` "posted" appears in the active channel; a post in another channel bumps its unread badge
- [ ] Flow: open a thread panel; keyboard shortcuts (Cmd/Ctrl+T new tab, Cmd/Ctrl+W close tab, Cmd+Shift+T threads view)
- [ ] run `npm run test` — must pass before Task 5

### Task 5: First Rust unit tests + confirmed Rust fixes

**Files:**
- Modify: `src-tauri/src/mattermost/client.rs` (fix scheme handling in `new` if confirmed), `src-tauri/src/mattermost/events.rs`, `src-tauri/src/storage/posts_cache.rs` (add `#[cfg(test)] mod tests`)
- Modify: `src-tauri/src/mattermost/types.rs` (serde-default tests as needed)

- [ ] Add failing test for `MattermostClient::new` + `api_url` with scheme-less, trailing-slash, and `http(s)://` inputs; fix `new` to prepend a scheme when missing
- [ ] `posts_cache`: save→load round-trip via a `tempfile`/tmp dir, malformed-file returns `None`
- [ ] `events.rs`/`types.rs`: deserialize representative Mattermost WS payloads (missing optional fields use serde defaults)
- [ ] run `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` — must pass before Task 6

### Task 6: Verify acceptance criteria

- [ ] run full frontend suite: `npm run test`
- [ ] run Rust suite: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] run linters/format/typecheck: `npm run lint`, `npx tsc --noEmit`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- [ ] confirm every confirmed bug from Tasks 1/2/5 has a dedicated regression test and that the mentioned user flows (login, channel switch, send/receive message, threads, reactions, drafts, notifications) are covered end-to-end in `app.integration.test.tsx`

### Task 7: Update documentation

- [ ] Update `features.md`: flip "E2E test suite: Not started", add a "Bugs & Fixes" row per confirmed bug
- [ ] Update `README.md`/`BUILDING.md` only if the test-running commands or coverage story changed for contributors
