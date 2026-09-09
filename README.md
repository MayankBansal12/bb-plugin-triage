# Triage for BB

Triage is a visual workflow board for BB agent work. It creates GitHub-style
`Triage #42` cards, schedules them, assigns the full native BB execution
configuration, and lets assigned agents move their own cards between stages.

## Development

```sh
npm install
bb plugin install .
bb plugin dev
```

The plugin stores its board in BB's plugin-owned SQLite database. Worker
threads default to hidden sidebar visibility and remain directly
openable from their cards.

## Agent CLI

```sh
bb triage list
bb triage show 42
bb triage run 42
bb triage move 42 "Review" --summary "Implementation is ready"
bb triage stages
```

## Sessions and the sidebar

- Open a session and choose **Move to Triage** in its header. Triage creates a
  card for the existing conversation and hides it from the regular session list.
  Repeating the action reuses the same card; it never starts another agent.
- Linked cards and the session header's **Triage #…** menu show either
  **Show session in sidebar** or **Hide session from sidebar**, based on current visibility.
  Showing a session keeps its Triage card and history.
- In **Settings → Triage**, enable **Show Triage sessions in the sidebar** to show
  all existing linked sessions and future task sessions in the regular session
  list. It defaults to **off**. Changing it applies to all linked sessions;
  individual show/hide actions override it until the next setting change.
- **Triage settings → Show Triage in sidebar** controls the separate, default-off card section.
  When BB uses the **Triage above threads** sidebar layout, it also provides a
  **Move current session to Triage** control. With another sidebar plugin,
  use the session header action.

Imported sessions receive their assigned Triage agent tool and instructions on
subsequent agent configuration. Importing does not interrupt a running turn.

## Board controls

- **Triage settings** lets you rename stages and reorder them with drag handles
  (or focus a handle and use the up/down arrow keys).
- **Updates** opens on **Recent**, showing newest events first, grouped by day.
  Needs you, Running, and Pending show current task states. Opening a task marks
  its updates read; **Mark all read** clears the remaining unread updates.
- Search the project picker by name. Selecting a project selects its configured
  default machine when available; select **All machines** to widen the view.
  The personal project is labeled **Personal**.

## Compatibility and verification

Requires BB 0.42+ and a compatible Plugin SDK 0.4.47 runtime. For a reproducible
checkout, run `npm ci`, `npm run typecheck`, `npm test`, and `bb plugin build`.
The GitHub Actions workflow checks types, tests, and production dependencies.

New cards start in To Do. Agent execution moves them to In Progress; agents are
instructed to explicitly report completion or a need for attention. Ending a turn
alone does not mark work complete. Scheduled tasks require BB and Triage to be
running; overdue work is picked up when the scheduler resumes.

See [release readiness](RELEASE_READINESS.md) for the remaining public-distribution
steps. No marketplace entry or release is created by this branch.
