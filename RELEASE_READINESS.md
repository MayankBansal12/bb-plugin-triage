# Release readiness

This branch prepares the plugin repository only. It does not publish a release
or create a BB Community marketplace entry.

## Validation

Run from a clean checkout with Node.js 22 and BB 0.42 or later:

```sh
npm ci
npm run typecheck
npm test
npm audit --omit=dev --audit-level=high
bb plugin types --check
bb plugin build
```

The GitHub Actions workflow checks installation, types, tests, public SDK imports,
and production dependency advisories. The BB bundle build and live UI smoke check
are local release checks; CI does not provision a BB installation.

Exercise new-task creation, scheduling, existing-session import, title editing,
sidebar switches, stage moves, and notification navigation in BB before release.
The data migrations on this branch are unchanged from main.

## Distribution prerequisites

- The repository was private at review time. The marketplace needs a public Git
  source or public npm package; the owner must decide which to expose.
- No release tags existed at review time. After merging and validating the final
  commit, publish an immutable version tag matching package.json (currently
  0.1.0) if choosing Git distribution. Do not move an existing release tag.
- For a future marketplace entry, use plugin ID `triage`, a supported category,
  an owner identity, a vendored icon, and the overview in PLUGIN_OVERVIEW.md.
  Capture screenshots of the released UI without private task data.
- Choose distribution/license terms before public release; this repository does
  not currently include a license. Do not infer a license from vendored components.
- Git installs build source. npm publication is not configured here; publishing
  through npm needs an explicit package file list that includes the built dist
  artifacts, followed by `npm pack --dry-run --ignore-scripts` verification.

The sidebar status accessory discussed during development is only a proposal and
is not part of this release. Compact layouts use the existing responsive controls.

Marketplace requirements should be rechecked at submission time:
https://github.com/get-bb/marketplace/blob/main/README.md
