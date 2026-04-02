# Mattermost Desktop Client — Plan

## Stack
- **Tauri 2** + **React/TypeScript** (Vite) + **Rust** backend
- Platforms: macOS, Windows, Linux
- Multi-server support
- Test server: `http://localhost:8065` (admin / Admin123!)

## Architecture
- **State**: Zustand (frontend UI), Rust AppState (global, Arc<Mutex>)
- **WebSocket**: Rust-side tokio-tungstenite, events forwarded via Tauri emit
- **IPC**: Tauri commands (type-safe Rust → JS)
- **API client**: Custom reqwest + serde layer
- **Local cache**: SQLite via rusqlite (future)
- **Token storage**: JSON config (OS keychain planned)

---

## Phases

### Phase 0 — Scaffolding & Infrastructure [DONE]
- [x] Rust + Node.js toolchain
- [x] Tauri 2 project init (React + TS + Vite)
- [x] Project directory structure
- [x] GitHub Actions CI/CD (ci.yml, build.yml)
- [x] .env.example, .gitignore, git init

### Phase 1 — Authentication & Server Connection [DONE]
- [x] MattermostClient (reqwest): ping, login, logout, get_me
- [x] Server registry + JSON persistence
- [x] Tauri commands: add_server, remove_server, list_servers, login, logout, validate_session
- [x] Login UI: ServerUrlInput, LoginForm (password + PAT)
- [x] Multi-server shell: ServerSidebar (icon rail)
- [x] Session restore on startup

### Phase 2 — Teams, Channels & WebSocket [DONE]
- [x] REST: get_teams, get_channels_for_team, get_channel, view_channel, get_users_by_ids
- [x] WebSocket manager (tokio-tungstenite): connect, auth, parse events, exponential backoff reconnect
- [x] Per-server WS task, events forwarded via Tauri emit
- [x] Channel list UI: grouped (public/private/DM), unread badges, active highlight
- [x] Team switching, Header with team selector + WS status indicator
- [x] Zustand store: teams, channels, users cache, wsStatus

### Phase 3 — Messaging (Core) [DONE]
- [x] REST: get_posts_for_channel, create_post, update_post, delete_post
- [x] Message list: scroll, date separators, scroll-to-bottom
- [x] Markdown rendering: bold/italic/code/links/@mentions
- [x] Message composer: multi-line, Enter to send, Shift+Enter newline
- [x] Real-time: WS posted/edited/deleted → update list
- [x] Edit/delete own messages

### Phase 4 — Threads (CRT) [DONE]
- [x] REST: get_post_thread, get_user_threads, follow/unfollow, mark_thread_as_read
- [x] Thread panel (right side): root post + replies + own composer
- [x] Reply button, reply count badge in message list
- [x] Dedicated Threads view with all/unread filter

### Phase 5 — Notifications & Presence [DONE]
- [x] Desktop notifications (tauri-plugin-notification)
- [x] Presence: online/away/DND/offline dots via WS status_change
- [x] Typing indicators: display "[User] is typing...", auto-clear 5s
- [x] Badge count (dock/taskbar) — set_badge_count command, updates on WS events
- [x] Custom status (emoji + text + expiry) — API + StatusPicker UI
- [x] Per-channel notification prefs — right-click context menu on channels

### Phase 6 — Files & Search [DONE]
- [x] File upload: Rust multipart endpoint
- [x] File display: image preview, generic file with size, download button
- [x] File download via Rust reqwest to Downloads folder
- [x] Full-text search with Cmd+K, modifiers support (from:/in:/before:/after:)
- [x] Search results with click-to-navigate

### Phase 7 — Profile & Settings [DONE]
- [x] User popover (click avatar in messages)
- [x] Profile modal: edit name/nickname/position, avatar upload
- [x] Status picker (online/away/DND/offline)
- [x] Settings modal: theme, time format, compact mode, send-on-enter, notifications toggle
- [x] Keyboard shortcuts help modal (Cmd+/)
- [x] User menu in header (profile, settings, status, shortcuts)
- [x] Settings persistence via localStorage

### Phase 8 — Emoji, Reactions & Message Mgmt [DONE]
- [x] Emoji picker (categorized, searchable)
- [x] Reactions bar on messages (add/remove, grouped, tooltip)
- [x] Pin/unpin messages with visual indicator
- [x] Save (bookmark) messages
- [x] Saved posts API (get_saved_posts)
- [ ] GIF picker (GIPHY/Tenor) — deferred
- [x] Emoji autocomplete in composer — type `:name` to autocomplete, Tab/Enter to insert
- [ ] Forward messages, reminders — deferred

### Phase 9 — Channel Organization [DONE]
- [x] Create channel (public/private, name, purpose, header)
- [x] Archive (delete) channel
- [x] Update channel (display name, header, purpose)
- [x] Leave channel
- [x] Create Channel button in sidebar
- [x] Favorites — right-click to add/remove, separate Favorites group in sidebar
- [ ] Custom categories, drag-and-drop — deferred
- [ ] Channel bookmarks — deferred

### Phase 10 — System Tray, Multi-Window & Deep Linking
- [x] System tray with icon, menu (Show/Hide/Quit), click to show
- [x] Close-to-tray (hide window on close instead of quitting)
- [x] Badge count (dock/taskbar) via set_badge_count command
- [ ] Pop-out threads/channels — deferred
- [ ] mattermost:// URL scheme (tauri-plugin-deep-link) — deferred (needs network)
- [ ] Auto-update (tauri-plugin-updater) — deferred (needs network)

### Phase 10.5 — Channel & DM Tabs [DONE]
- [x] Tab bar in the main content area (between channel header and message list)
- [x] Open channels and DMs in separate tabs (click opens in new tab, middle-click or via context menu)
- [x] Tab shows channel/DM name, icon type (# / 🔒 / 💬 for DMs / 👥 for groups)
- [x] Active tab highlighted, tabs scrollable if overflow
- [x] Close tab via × button, last tab cannot be closed
- [x] Unread badge on tab when a new message arrives in a background tab (same logic as channel sidebar badges)
- [x] Tab state persisted in Zustand (tabsStore): list of open tabs, active tab id
- [x] WS `posted` event: if channel_id matches a non-active tab → increment tab unread counter
- [x] Switching to a tab clears its unread badge and marks channel as viewed (view_channel API call)
- [x] Keyboard shortcuts: Cmd+T new tab, Cmd+W close tab, Cmd+1–9 switch to nth tab

### Phase 11 — Calls Integration
- [ ] WebRTC via webview, signaling in Rust
- [ ] Call UI, screen sharing

### Phase 12 — Integrations, Polish & Performance
- [ ] Slash commands, interactive buttons, bot messages — deferred
- [x] Performance: React.memo on MessageItem, useMemo on message list, lazy-loaded modals, memoized callbacks
- [x] Accessibility: focus-visible styles, ARIA labels, keyboard nav (nav landmarks, aria-label, aria-current)
- [x] Fixed broken CSS variables (--color-error → --error, --color-success → --success)
- [x] Keyboard shortcut: Cmd+Shift+T to toggle Threads view
- [x] Updated shortcuts help modal
- [ ] E2E test suite — deferred

## Dependency Graph
```
P0 → P1 → P2 → P3 → P4
                  ├─→ P5 → P7, P10, P11
                  ├─→ P6
                  └─→ P8 → P9, P12
```
