---
name: vibe-kanban
description: Inspect or move Vibe Kanban cards and explain labels, priorities, and scheduled tasks in BB.
---

# Vibe Kanban

Use `bb vibe-kanban list`, `show <number>`, and `stages` to inspect the board.
Add `--json` for structured output. `bb vibe-kanban run <number>` starts a saved
task; `bb vibe-kanban move <number> <stage> --summary <text>` moves a card.

A card assigned to your thread provides the `vibe_kanban_move_task` tool and
current stage instructions. Report completed work or required user input before
your final response. Do not infer completion merely because a turn ended.

Users choose labels and priorities on the board. Priority affects optional
sorting, not agent execution order or scheduling. Leave that decision to the user.
New tasks default to On board; Schedule and Run now are explicit choices.
Scheduled work needs BB and this plugin running. Child-thread numbers count
non-deleted children, including hidden and archived children; they are not
completion ratios. Open the parent card to follow native BB orchestration.
