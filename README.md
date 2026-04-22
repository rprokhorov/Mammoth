# Mammoth — Mattermost Desktop Client

Cross-platform desktop client for Mattermost, built with **Tauri 2** (Rust backend) + **React + TypeScript** frontend.

See [BUILDING.md](BUILDING.md) for build, dev setup, and release instructions.

---

## Testing

### Stack

| Tool | Purpose |
|------|---------|
| [Vitest](https://vitest.dev) | Test runner (fast, Vite-native) |
| [jsdom](https://github.com/jsdom/jsdom) | Browser environment emulation |
| [@testing-library/react](https://testing-library.com/react) | React component testing utilities |
| [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) | Custom DOM matchers |

### Running tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch
```

### Test location

All test files live in `src/test/`:

```
src/test/
  setup.ts                    # Global setup: Tauri API mocks
  messagesStore.test.ts       # messagesStore — posts, ordering, reply counts
  threadsStore.test.ts        # threadsStore — thread replies, unread counters, follow state
  tabsStore.test.ts           # tabsStore — tabs lifecycle, unread badges
  lastViewedSnapshot.test.ts  # lastViewedSnapshot — session-stable channel snapshot
```

### Rules

**What to test:**
- Pure store logic (Zustand actions and state transitions)
- Utility functions with non-trivial logic
- Edge cases that were historically sources of bugs (see `features.md`)

**What not to test:**
- Components that require Tauri IPC (`invoke`, `listen`) — mock Tauri at the boundary, not inside components
- Integration with the real Mattermost server
- UI rendering details that don't reflect business logic

**Mocking Tauri:**

All Tauri APIs are mocked in `src/test/setup.ts`. Tests must not rely on actual Tauri binaries or IPC. If a store or hook calls `invoke`, mock it at the test level:

```ts
import { invoke } from "@tauri-apps/api/core";
vi.mocked(invoke).mockResolvedValue({ ... });
```

**Store isolation:**

Reset store state in `beforeEach` to prevent test pollution:

```ts
beforeEach(() => {
  useMyStore.setState({ /* initial state */ });
});
```

**Naming:**

- Test files: `<subject>.test.ts` (or `.test.tsx` for components)
- `describe` blocks: name of the module or store
- Nested `describe`: name of the action/function being tested
- `it`: plain English description of the expected behaviour

**Coverage focus:**

Prioritise testing logic that has previously caused bugs. Each entry in the "Bugs & Fixes" table in `features.md` should have at least one corresponding test.
