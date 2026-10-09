# Vibe Kanban

Plan, prioritize, and follow coding-agent work inside BB.

- A compact board with configurable columns and per-column task creation.
- Custom colored labels, user-controlled priorities, and priority sorting.
- A compact toolbar with project and view selection, search, and a single Filters menu
  for machines, agents, labels, and sorting.
- Clear live agent activity and child-thread counts when children exist.
- Native BB conversations and orchestration, one click from the board.
- Keep tasks on the board, schedule them, or start their agents immediately.
- Recent updates, archived cards, and optional sidebar integration.

Assigned agents update workflow stages through `vibe_kanban_move_task`.
Use `bb vibe-kanban list`, `show`, `run`, `move`, and `stages` from the CLI.

Requires BB 0.42+ with a compatible Plugin SDK 0.4.47 runtime and a configured
agent provider. Data stays in BB's plugin database. Scheduled work starts while
BB and Vibe Kanban are running, including overdue work after a restart.
