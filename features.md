# Mattermost Desktop Client — Implementation History

## Phases Completed

| Phase | Name | Status |
|-------|------|--------|
| 0 | Scaffolding & Infrastructure | Done |
| 1 | Authentication & Server Connection | Done |
| 2 | Teams, Channels & WebSocket | Done |
| 3 | Messaging (Core) | Done |
| 4 | Threads (CRT) | Done |
| 5 | Notifications & Presence | Done |
| 6 | Files & Search | Done |
| 7 | Profile & Settings | Done |
| 8 | Emoji, Reactions & Message Management | Partial |
| 9 | Channel Organization | Partial |
| 10 | System Tray, Multi-Window & Deep Linking | Partial |
| 11 | Calls Integration | Not started |
| 12 | Integrations, Polish & Performance | Partial |

---

## Chronological Log

### Phase 0 — Scaffolding (2026-03-31)
- Tauri 2 project scaffolded (React + TS + Vite + Rust)
- Directory structure, ESLint, Prettier, clippy, Vitest, path aliases
- GitHub Actions CI/build workflows
- Mattermost test server deployed via Docker (localhost:8065)
- **No issues**

### Phase 1 — Authentication (2026-03-31)
- `MattermostClient` (reqwest): ping, login, logout, get_me
- Server registry with persistent config, token storage
- Login UI: server URL input, username/password form, PAT option
- Multi-server shell with server icon rail
- **No issues**

### Phase 2 — Teams, Channels & WebSocket (2026-03-31)
- REST: teams, channels, view_channel
- WebSocket manager (tokio-tungstenite): reconnect, heartbeat, event parsing
- Channel list UI: grouped public/private/DM, unread indicators
- Team switching, Zustand + Rust AppState wiring
- **No issues**

### Phase 3 — Messaging (2026-03-31 to 2026-04-01)
- REST: get/create/update/delete posts
- Virtualized message list (@tanstack/react-virtual), date separators, infinite scroll
- Markdown rendering (react-markdown + remark-gfm), code blocks, @mentions
- Message composer: multi-line, @mention autocomplete, ~channel autocomplete
- Real-time WS events: posted/edited/deleted
- SQLite message cache
- **No issues during implementation, but bugs found during testing (see below)**

### Phase 4 — Threads (2026-04-01)
- REST: get_post_thread, get_user_threads, follow/unfollow, mark_thread_as_read
- Thread panel (right side): root post + replies + composer
- Reply button, reply count badge on messages
- Threads view in sidebar: all followed threads, unread highlight
- **No issues during implementation, bugs found later during testing**

### Phases 5-9 — Bulk implementation (2026-04-01)
- Phase 5: Desktop notifications, badge count, presence, typing indicators
- Phase 6: File upload (drag-and-drop, clipboard paste), inline image preview, lightbox, file download, search (Cmd+K)
- Phase 7: User popover, profile modal, status picker, settings page
- Phase 8: Emoji picker, reactions bar, pin/unpin, saved messages
- Phase 9: Favorites, channel create/archive, context menu
- **No issues during implementation**

### Phase 10 — System Tray (2026-04-01, partial)
- System tray: icon, menu (Show/Hide/Quit), close-to-tray
- Badge count via window.set_badge_count()
- **Workaround:** `image` crate failed to download from crates.io (network issue). Used `png` crate directly for tray icon decoding.
- **Deferred:** Deep linking (tauri-plugin-deep-link download failed), auto-update (tauri-plugin-updater download failed), multi-window pop-out

### Deferred Features Batch (2026-04-01)
Implemented in one pass:
- Emoji autocomplete in composer (`:query` pattern, dropdown, arrow keys)
- Favorites group in channel list
- Per-channel notification prefs (context menu: All/Mentions/Mute)
- Badge count (dock badge + tray tooltip)
- Custom status (emoji + text + expiry picker)
- Performance: React.memo on MessageItem, lazy-loaded modals, useMemo/useCallback
- Accessibility: focus-visible, aria-labels, semantic nav elements

---

## Bugs & Fixes

### Resolved on first attempt

| Bug | Description | Root Cause | Fix |
|-----|-------------|------------|-----|
| Blank screen after login | No channels/messages/profile after connecting | `handleLoginSuccess` not called on session restore | Added teams/channels loading after session validation |
| Channel list empty | Channels loaded from API but not displayed | `#[serde(rename = "type")]` serialized as `"type"` instead of `"channel_type"`, frontend filter never matched | Changed to `#[serde(alias = "type")]` |
| Login form missing on startup | Infinite re-renders, blank screen | Zustand store destructuring in useEffect caused infinite loops | Replaced with `getState()` calls inside effects |
| Thread navigation broken | Clicking channel after Threads view doesn't switch | `handleSelectChannel` didn't clear `mainSubView` | Added `store.setMainSubView("channels")` in channel selection |
| Unread count persists | Badge not cleared when entering a channel | Badge only cleared after async server response | Added immediate `updateChannelMentions(channelId, 0, 0)` before server call |
| Thread read-marking broken | `mark_thread_as_read` invoke failing silently | Missing `teamId` parameter in ThreadPanel's invoke call | Read `activeTeamId` from `useUiStore` inside ThreadPanel |

### Required multiple attempts / user had to re-request

| Bug | Attempts | What happened |
|-----|----------|---------------|
| **Login form disappears (2nd occurrence)** | 2 | First reported after Phase 4 build. Initial fix (killed stale process on port 1420) didn't resolve it. Context window exhausted mid-debug. User re-reported after context resume. Root cause was deeper: Rules of Hooks violation + Zustand subscriptions to entire store object. Fixed by converting all `useUiStore()` to individual selectors `useUiStore((s) => s.field)`. |
| **Thread replies showing in main channel** | 2 | User reported but context window was exhausted immediately after. User had to re-send the exact same request in the next session. Fix: added `if (post.root_id) continue` in MessageList, changed WS handler to use `updatePost` instead of `addPost` for thread replies. |
| **Thread reply count not shown** | 2 | User sent request, no response appeared (slow processing). User re-sent 4 minutes later. Fix: computed reply counts from loaded posts in `setChannelPosts`, added `incrementReplyCount` in WS handler. |
| **Threads unread badge not appearing** | 2 | **Attempt 1:** User reported badge only appears after opening Threads view. Fix: added `loadUserThreads()` on app startup. **Attempt 2:** User reported it still doesn't work when in a channel/DM. Root cause: `incrementThreadUnread` silently returned when thread wasn't in the local `userThreads` array. Fix: changed to always increment `userThreadsUnread` even when thread not found locally. |

---

## Запросы пользователя

Исправления и фичи, запрошенные пользователем во время тестирования, переформулированные как описание функциональности.

| # | Запрос | Статус | Попыток |
|---|--------|--------|---------|
| 1 | После авторизации приложение должно автоматически загружать и отображать команды, каналы и профиль пользователя | Готово | 1 |
| 2 | Список каналов должен корректно отображать все каналы с сервера (публичные, приватные, ЛС) | Готово | 1 |
| 3 | Приложение должно восстанавливать сессию при запуске без повторного ввода логина и пароля | Готово | 1 |
| 4 | Ответы в тредах должны отображаться только в панели треда, а не в основном списке сообщений канала | Готово | 2 (потеря контекста) |
| 5 | Клик по каналу из вида «Треды» должен переключать на канал; кнопка «Треды» должна снимать выделение с активного канала | Готово | 1 |
| 6 | Сообщения в канале должны показывать индикатор количества ответов в треде | Готово | 2 (повторная отправка) |
| 7 | Бейдж непрочитанных на канале должен считаться только по корневым сообщениям; ответы в тредах увеличивают счётчик раздела «Треды» | Готово | 1 |
| 8 | Бейдж непрочитанных на канале должен сбрасываться сразу при входе в канал | Готово | 1 |
| 9 | Подписанные треды должны показывать количество непрочитанных ответов, а открытие треда должно отмечать его как прочитанный | Готово | 1 |
| 10 | Бейдж непрочитанных тредов должен обновляться в реальном времени независимо от текущего вида (канал, ЛС или «Треды») | Готово | 2 (первый фикс не покрыл треды, отсутствующие в локальном кеше) |
| 11 | В списке сообщений не должно быть горизонтальной прокрутки; в поле ввода не должно быть вертикальной прокрутки, максимум 6 строк | Готово | 1 |
| 12 | Всплывающее окно выбора статуса должно закрываться при клике в любое место вне него | Готово | 1 |
| 13 | Левый клик по каналу должен менять содержимое дефолтного таба, а новый таб создаётся только по среднему клику или через контекстное меню | Готово | 1 |
| 14 | Поддержка авторизации через GitLab SSO в форме логина (открытие SSO-окна, захват токена, автоматический вход) | Готово | 8 (eval() не работает на внешних URL в Tauri, reqwest не имеет сессионных куков webview, mobile_login endpoint не триггерит on_navigation для mmauth://. Решение: Tauri cookies_for_url() API для чтения HttpOnly куков напрямую из cookie store webview) |
| 15 | Сообщения в панели треда должны быть отсортированы по времени (от старых к новым) | Готово | 1 |
| 16 | В панели треда должны отображаться реакции на сообщения и должна работать возможность добавлять реакции | Готово | 1 |
| 17 | В сообщениях должны отображаться прикреплённые изображения с возможностью увеличить по клику | Готово | 1 |
| 18 | Сообщения должны поддерживать полную Markdown-разметку (заголовки, списки, таблицы, blockquote, код) | Готово | 1 |
| 19 | Блоки кода не должны вызывать горизонтальную прокрутку — длинные строки переносятся | Готово | 1 |
| 20 | Диалог 1 на 1 должен отображаться с именем собеседника, а не текущего пользователя | Готово | 1 |
| 21 | Каналы в боковой панели должны быть разбиты по категориям, созданным пользователем в Mattermost | Готово | 2 (API возвращает обёртку {categories:[...]}, а не массив) |
| 22 | Возможность прикреплять файлы и изображения к сообщениям (кнопка 📎, drag-and-drop, вставка из буфера); превью картинок высотой равной строке ввода | Готово | 2 (фильтр типов файлов блокировал выбор на macOS; стили превью отсутствовали) |
| 23 | Кнопка выбора смайлика 😊 в поле ввода сообщения и в панели треда; вставка эмодзи в позицию курсора | Готово | 2 (пикер закрывался сразу из-за конфликта mousedown; fix: triggerRef в EmojiPicker) |
| 24 | Клик средней кнопкой мыши по корневому сообщению открывает панель тредов; повторный клик по другому сообщению переключает тред | Готово | 1 |
| 25 | При открытии канала список сообщений должен оставаться прокрученным до последнего сообщения, даже когда картинки догружаются асинхронно | Готово | 3 (ResizeObserver не помог; placeholder-высота не помогла; fix: onLoad на img → scrollTop=scrollHeight если у дна) |
| 26 | Закрытие лайтбокса с картинкой по нажатию Esc | Готово | 1 |
| 27 | Изменение ширины панелей (каналы, чат, треды) перетаскиванием разделителя | Готово | 1 |
| 28 | Тёмные скроллбары под тёмную тему (color-scheme: dark + явные цвета трека) | Готово | 2 (transparent трек не работал в WebKit) |
| 29 | Быстрая загрузка картинок: thumbnail показывается сразу, оригинал подгружается фоново и заменяет превью; оба кэшируются в памяти | Готово | 2 (первый вариант загружал оригинал только при клике) |
| 30 | Поддержка кастомных эмодзи сервера: отображение в сообщениях как img, вкладка ★ в пикере, кэширование иконок | Готово | 1 |
| 31 | Исправить пагинацию кастомных эмодзи (per_page снижен до 100 — реальный лимит API); расширить стандартный набор эмодзи с ~80 до ~700+ по категориям | Готово | 2 (пустые :name: в гриде; недостающие People-маппинги) |
| 32 | Пикер эмодзи (в composer, треде и реакциях) должен открываться вверх или вниз в зависимости от места на экране, не уходя за его пределы | Готово | 2 (composer/thread исправлены отдельно; реакции в MessageItem исправлены следующим шагом) |
| 33 | Поле ввода сообщения растягивается до 20 строк без вертикального скролла (в composer и в панели тредов) | Готово | 1 |
| 34 | Кастомные эмодзи отображаются в реакциях на сообщения (вместо текста :name: рендерится img) | Готово | 1 |
| 35 | При сетевой ошибке во время запуска приложение не выкидывает на форму логина — токен сохраняется, приложение открывается в обычном режиме | Готово | 1 |
| 36 | При наведении на реакцию показывается имя пользователя (nickname / First Last / username), а не логин | Готово | 1 |
| 37 | Аватарки пользователей отображаются в сообщениях, иконке профиля в хедере и в настройках профиля; при отсутствии фото — инициалы | Готово | 1 |

---

## Deferred / Not Yet Implemented

| Feature | Reason |
|---------|--------|
| Forward messages | Not yet implemented |
| Message reminders | Not yet implemented |
| Custom sidebar categories + drag-and-drop | Not yet implemented |
| Channel bookmarks | Not yet implemented |
| Deep linking (mattermost:// URL) | tauri-plugin-deep-link download failed (network) |
| Auto-update | tauri-plugin-updater download failed (network) |
| Multi-window pop-out | Deferred |
| GIF picker | Deferred |
| WebRTC Calls (Phase 11) | Not started |
| E2E test suite | Not started |
| Slash commands, interactive buttons | Not started |

---

## Technical Workarounds

| Issue | Workaround |
|-------|-----------|
| `image` crate failed to download from crates.io | Used `png` crate directly (already cached) to decode PNG to raw RGBA for tray icon |
| `tauri-plugin-deep-link` download failed | Feature deferred |
| `tauri-plugin-updater` download failed | Feature deferred |
| Port 1420 conflict during dev | Identified and killed stale process |
| Context window exhausted 4 times | Sessions resumed via summary injection; some bugs had to be re-reported by user |
