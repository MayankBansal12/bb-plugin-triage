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
threads are created with hidden sidebar visibility and remain directly
openable from their cards.

## Agent CLI

```sh
bb triage list
bb triage show 42
bb triage run 42
bb triage move 42 "Review" --summary "Implementation is ready"
bb triage stages
```
