# Stores — Zustand State Management

## Why Zustand?

Zustand is the simplest state management for React. Compare:
- **Redux**: ~50 lines of boilerplate for one feature
- **Zustand**: ~10 lines for the same feature

For a solo developer, that simplicity is a feature, not a limitation.

## How Stores Work

Each store is a hook that you call in your components:

```jsx
import { useSettingsStore } from '@/stores/useSettingsStore';

function MyComponent() {
  const { theme, setTheme } = useSettingsStore();
  // Use theme, call setTheme('dark')
}
```

## Store Files

- `useSettingsStore.js` — User preferences, system configuration
- `useAgentStore.js` — Agent registry and status (Phase 3)
- `useChatStore.js` — Chat messages and threads (Phase 2)
- `useRunStore.js` — Active/completed runs (Phase 3)
