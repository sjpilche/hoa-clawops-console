# Components

## Organization

- `ui/` — Low-level reusable primitives (buttons, inputs, dialogs). shadcn/ui style.
- `layout/` — App shell: sidebar, header, page wrapper.
- `chat/` — Chat panel, messages, input. (Phase 2)
- `agents/` — Agent cards, grid, detail views. (Phase 3)
- `monitor/` — Live dashboard, log stream. (Phase 5)
- `results/` — Data explorer, exports. (Phase 6)
- `safety/` — Confirmation dialogs, budget guards. (Phase 4)

## Naming Convention

- Files: PascalCase.jsx (e.g., `AgentCard.jsx`)
- One component per file
- Export as default

## Comment Standard

Every component file starts with a JSDoc block explaining:
1. What it does
2. What props it accepts
3. What safety concerns exist (if any)
