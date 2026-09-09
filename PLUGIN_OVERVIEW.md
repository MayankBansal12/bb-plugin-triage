## Keep agent work in view

Turn work into Triage cards, choose a project and agent, and run it immediately,
schedule it for later, or keep it on the board until you are ready. Each card
opens its linked BB conversation so you can follow the work without losing context.

## What you get

- A workflow board with configurable stage names and ordering.
- Existing sessions can become cards without starting another agent.
- Task titles, project and branch details, and agent identity in cards and updates.
- Running, unread, and settled views for keeping the board manageable.
- Separate, default-off preferences for sidebar cards and linked sessions.

Assigned agents use `triage_move_task` to report progress, completion, or a need
for human attention. You can also inspect and move cards with `bb triage list`,
`bb triage show`, `bb triage move`, and `bb triage stages`.

## Requirements and storage

Requires BB 0.42 or later with a compatible Plugin SDK 0.4.47 runtime and a
configured agent provider. Provider accounts and usage charges still apply.
Triage stores its board and update history in BB's plugin-owned SQLite database.
Scheduled tasks run while BB and the plugin are running; overdue tasks are picked
up when the scheduler resumes. Browser notifications require your permission.
