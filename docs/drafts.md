# Draft механизм в официальном Mattermost клиенте

## Структура Draft объекта (`PostDraft`)

```typescript
{
  message: string              // текст сообщения
  fileInfos: FileInfo[]        // прикреплённые файлы
  uploadsInProgress: string[]  // файлы в процессе загрузки
  props: object                // дополнительные свойства
  caretPosition: number        // позиция курсора
  channelId: string            // ID канала
  rootId: string               // ID родительского сообщения (для тредов, иначе "")
  createAt: number             // timestamp создания
  updateAt: number             // timestamp обновления
  show: boolean                // видимость
  metadata: object             // приоритет и метаданные файлов
}
```

## Хранение

**Redux Store** — под `state.storage.storage` как key-value пары:
- Канальные черновики: ключ `StoragePrefixes.DRAFT + channelId`
- Тредовые черновики: ключ `StoragePrefixes.COMMENT_DRAFT + rootId`

**Персистентность:**
- Локально: `redux-persist` + `localForage` (localStorage)
- С сервером (с v7.7): синхронизация через API `/api/v4/users/{userId}/drafts`

## Reducer (`storage.ts`)

Основные экшены:
- `SET_GLOBAL_ITEM` — сохранить черновик (только если новее по timestamp)
- `REMOVE_GLOBAL_ITEM` — удалить черновик
- `STORAGE_REHYDRATE` — загрузить при старте приложения

## Когда сохраняется

- При изменении текста → `handleDraftChange()` (с debounce или `instant: true`)
- При переключении канала — только если содержимое изменилось (сравнивает `draftOnOpen` с текущим)
- При blur поля ввода

## Селекторы

Мемоизированные через `createSelector`:
- `makeGetDraft(channelId, rootId)` — получить конкретный черновик
- `makeGetDraftsByPrefix()` — все черновики по префиксу
- `makeGetDrafts()` — все черновики, отсортированные по `updateAt`

## Ключевые особенности

1. **Разделение**: канальные vs тредовые черновики различаются по `rootId` и префиксу ключа
2. **Серверная синхронизация** (v7.7+): черновики синхронизируются между вкладками/устройствами через API `/api/v4/users/{userId}/drafts`
3. **Миграции**: при загрузке нормализует структуру для обратной совместимости
4. **Timestamp-логика**: более новый черновик всегда побеждает (SET_GLOBAL_ITEM проверяет timestamp)
5. **Валидация**: `isPostDraftEmpty()` проверяет наличие сообщения, вложений, загрузок, метаданных приоритета

## Разница: канальный черновик vs тредовый

| | Канальный | Тредовый |
|---|---|---|
| `rootId` | `""` (пустая строка) | ID родительского сообщения |
| Префикс ключа | `StoragePrefixes.DRAFT` | `StoragePrefixes.COMMENT_DRAFT` |

## Серверный API (v7.7+)

Синхронизация с сервером — опциональная (Settings > Advanced > "Allow message drafts to sync with the server").

Эндпоинты:
- `GET /api/v4/users/{userId}/drafts` — загрузить черновики
- `POST /api/v4/drafts` — сохранить/обновить черновик
- `DELETE /api/v4/users/{userId}/channels/{channelId}/drafts` — удалить черновик

Таблица в БД хранит: `message`, `channelId`, `rootId`, `userId`, `createAt`, `updateAt`, `priority`.

## WebSocket события (синхронизация в реальном времени)

Сервер шлёт события при изменении черновиков на других клиентах:

| Событие | Когда | Payload |
|---|---|---|
| `draft_created` | Черновик создан на другом клиенте | `{ draft: JSON string }` |
| `draft_updated` | Черновик изменён на другом клиенте | `{ draft: JSON string }` |
| `draft_deleted` | Черновик удалён на другом клиенте | `{ draft: JSON string }` |

## Источники

- [Mattermost v7.7 Release Blog](https://mattermost.com/blog/mattermost-v7-7-is-now-available/)
- [PR #28620 - Don't save unmodified drafts when changing channels](https://github.com/mattermost/mattermost/pull/28620)
- [PR #21752 - Saves priority for drafts](https://github.com/mattermost/mattermost/pull/21752)
- [Main repo](https://github.com/mattermost/mattermost)

---

# Реализация в нашем клиенте

## Файлы

| Файл | Роль |
|---|---|
| `src/stores/draftsStore.ts` | Zustand стор с persist + серверная синхронизация |
| `src/components/message/MessageComposer.tsx` | Сохранение/восстановление черновика при вводе |
| `src/components/message/DraftsView.tsx` | Список всех черновиков (панель) |
| `src/components/layout/ChannelList.tsx` | Кнопка 📝 Drafts в боковой панели |
| `src/hooks/useWebSocket.ts` | Обработка WS событий `draft_*` |
| `src/App.tsx` | Загрузка черновиков с сервера при старте |
| `src-tauri/src/commands/drafts.rs` | Tauri-команды: get/upsert/delete |
| `src-tauri/src/mattermost/client.rs` | HTTP методы к API черновиков |
| `src-tauri/src/mattermost/types.rs` | Типы `Draft`, `UpsertDraftRequest` |

## Структура DraftData (наш клиент)

```typescript
interface DraftData {
  message: string;
  channelId: string;
  rootId: string;   // "" для канала, postId для треда
  updateAt: number; // timestamp для разрешения конфликтов
}
```

Ключи в сторе:
- Канальный черновик: `channel:{channelId}`
- Тредовый черновик: `thread:{rootId}`

## Жизненный цикл черновика

```
Пользователь набирает текст
        │
        ▼
MessageComposer: onChange → setDraft(channelId, rootId, text)
        │
        ▼
draftsStore.setDraft()
  ├─ Обновляет локальный стор (мгновенно)
  ├─ Сохраняет в localStorage (persist middleware)
  └─ scheduleSyncToServer() → debounce 1500ms → invoke("upsert_draft")
                                                        │
                                                        ▼
                                              POST /api/v4/drafts
                                                        │
                                              Сервер шлёт WS событие
                                              draft_updated другим клиентам

Пользователь отправляет сообщение
        │
        ▼
MessageComposer: handleSend() → clearDraft(channelId, rootId)
        │
        ▼
draftsStore.clearDraft()
  ├─ Удаляет из локального стора
  ├─ Отменяет pending debounce (cancelSyncTimer)
  └─ invoke("delete_draft") → DELETE /api/v4/users/{userId}/channels/{channelId}/drafts

Пользователь переключает канал
        │
        ▼
MessageComposer: useEffect([channelId, rootId]) → getDraft(channelId, rootId)
  ├─ Если черновик есть → setText(draft.message)  (восстановление)
  └─ Если нет → setText("")
```

## Серверная синхронизация при старте

```
App.tsx: loadServers() / handleLoginSuccess()
        │
        ▼
draftsStore.loadFromServer(serverId)
        │
        ▼
invoke("get_drafts") → GET /api/v4/users/{userId}/drafts
        │
        ▼
Мёрдж с локальными черновиками:
  для каждого серверного черновика:
    если локального нет → берём серверный
    если есть → побеждает тот, у кого updateAt больше
        │
        ▼
setState({ drafts: merged, serverId })
```

## Синхронизация в реальном времени (WebSocket)

```
Другой клиент изменил черновик
        │
        ▼
Сервер → WS event "draft_created" / "draft_updated"
        │
        ▼
useWebSocket.ts: handleDraftUpserted(data)
  ├─ Парсит data.draft (JSON string)
  ├─ Сравнивает draft.update_at с локальным updateAt
  └─ Если серверный новее → обновляет стор напрямую (без обратной синхронизации на сервер)

Другой клиент удалил черновик
        │
        ▼
Сервер → WS event "draft_deleted"
        │
        ▼
useWebSocket.ts: handleDraftDeleted(data)
  └─ Удаляет черновик из стора по ключу channel/thread
```

## Приоритет при конфликтах

| Ситуация | Кто побеждает |
|---|---|
| Загрузка с сервера vs локальный | Тот, у кого `updateAt` больше |
| WS событие vs локальный | WS применяется только если его `update_at` новее |
| Локальный ввод | Всегда применяется мгновенно (debounce только для сетевого запроса) |

## Rust API (Tauri команды)

```rust
// Загрузить все черновики пользователя
get_drafts(server_id: String) -> Vec<DraftData>
  → GET /api/v4/users/{userId}/drafts

// Сохранить/обновить черновик
upsert_draft(server_id, channel_id, root_id, message) -> ()
  → POST /api/v4/drafts

// Удалить черновик
delete_draft(server_id, channel_id, root_id) -> ()
  → DELETE /api/v4/users/{userId}/channels/{channelId}/drafts[?root_id=...]
```

## DraftsView — панель черновиков

Кнопка 📝 **Drafts** в боковой панели (ниже Reactions). Показывает badge с количеством черновиков.

Функциональность:
- Список всех черновиков, отсортированных по `updateAt` (новые сверху)
- Показывает: название канала/треда, превью текста, время последнего изменения
- Клик → переходит в канал (или открывает тред), текст черновика восстанавливается в composer
- Кнопка ✕ (появляется при наведении) → удалить черновик (локально + сервер)
