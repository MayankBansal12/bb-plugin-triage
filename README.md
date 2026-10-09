# Vibe Kanban for BB

Plan work, set priorities, and follow your coding agents on a native BB kanban
board. Inspired by [Vibe Kanban](https://vibekanban.com/), with BB's own agent
composer, conversations, orchestration, theme, and navigation.

## Plan and organize

- Start with **Backlog → To Do → In Progress → In Review → Done**. Add, rename,
  or reorder columns in board settings. Drag cards or use **Move to** in a
  card's menu, including on touch devices.
- Use **Labels & priority** in a card’s menu to organize it. Create colored
  labels there or in the **Labels** menu. Rename, recolor,
  or delete them across the board.
- Choose **No priority**, **Urgent**, **High**, **Medium**, or **Low** on each
  card. Priority is your decision; agents never assign it. Sort by priority or
  recent activity. Priority does not change scheduling or execution order.
- Filter by project, machine, agent, and labels together. Multiple selected
  labels mean a card must have all of them. Search titles, task IDs, projects,
  and label names. Machine, agent, labels, and sorting live in **Filters**;
  active filters appear below the toolbar and can be cleared with one click.
  Use the **Board** dropdown to switch to Running, Unread, Scheduled, or Archived.

## Start work when you're ready

Use **New task** or a column's **+** button. Describe the work in BB's native
composer, choose its agent and environment, then choose a start behavior:

| Start | Action | Behavior |
| --- | --- | --- |
| On board (default) | Add to board | Saves the task without starting an agent. |
| Schedule | Schedule task | Starts automatically at the date and local time you choose. |
| Run now | Run task | Starts the agent immediately. |

Saved tasks can be edited or started with the card's play button. Scheduling
requires BB and Vibe Kanban to be running; overdue tasks are picked up when the
scheduler resumes. Starting work moves its card to In Progress.

## Follow your agents

Cards show the assigned agent and a clear **Agent running** or **Agent starting**
indicator while BB reports live activity. Agent activity is independent of a
card's workflow column. Opening a card takes you to the native BB conversation,
where the existing live work and orchestration remain available.

Cards show labels, assigned priority, and child-thread counts only when present.
Empty labels, unassigned priority, and zero or unavailable child counts stay hidden.
The branch icon shows the non-deleted child-thread count, including hidden and
archived children. This is a count, not a completed / total progress ratio or a
child-thread navigator. The board refreshes on live events, reconnection, focus, and every
15 seconds while visible.

Agents explicitly report completion or a need for attention using the assigned
`vibe_kanban_move_task` tool. Ending a turn alone does not mark work complete.
The **Updates** panel keeps recent events, unread updates, and work needing you.
Use **Archive card** to remove resolved work from the active board; find it again
under **Archived**. Archiving a card does not archive its BB conversation.

## Existing sessions and the sidebar

- Choose **Move to Vibe Kanban** in a session header to create a card for that
  conversation and hide the session from the regular list. Repeating the action
  reuses the same card.
- A card's menu and the session header let you show or hide its linked session
  in the sidebar.
- **Settings → Vibe Kanban → Show Vibe Kanban sessions in the sidebar** controls
  all linked sessions, including future ones. It defaults to off.
- Board settings can enable an optional card section above the native thread
  list. Select **Vibe Kanban above threads** as the sidebar layout to use it.

## Local development

Requires BB 0.42+ with a compatible Plugin SDK 0.4.47 runtime and a configured
agent provider. Provider accounts and usage charges still apply. Cards, labels,
priorities, and update history live in BB's plugin-owned SQLite database; there
is no separate service or account. Browser notifications require permission.

```sh
npm ci
npm run typecheck
npm test
bb plugin build
bb plugin install . --yes
bb plugin dev .
```

The local plugin ID and CLI command are `vibe-kanban`.

```sh
bb vibe-kanban list
bb vibe-kanban show 42
bb vibe-kanban run 42
bb vibe-kanban move 42 "In Review" --summary "Implementation is ready"
bb vibe-kanban stages
```

## License

[MIT](LICENSE) © 2026 Mayank Bansal.
