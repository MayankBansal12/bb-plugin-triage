# Release readiness

Target package: `bb-plugin-triage@0.1.0`. The package and lockfile already use
0.1.0; preparing the listing does not publish a release.

## Before the first public release

- Make the repository public and verify it is accessible without authentication.
- Run `npm ci`, `npm run typecheck`, `npm test`,
  `npm audit --omit=dev --audit-level=high`, and `bb plugin build` on the release commit.
- Smoke-test a fresh installation: create and edit a task, run and schedule work,
  import an existing session, move stages, open updates, and toggle both sidebar
  preferences. Verify overdue scheduling after restart.
- Merge the preparation PR, select the release commit, and publish an immutable
  `v0.1.0` tag after release approval. Do not move an existing release tag.

CI currently verifies installation, types, tests, and the production dependency
security threshold. It does not run the BB build or live installation checks.

## Public experimental SDK dependencies

These APIs are public exports in SDK 0.4.47, but have not been stabilized:

| API | Purpose |
| --- | --- |
| `experimental_NewThreadComposer` | Native task creation and execution controls |
| `experimental_threadHeaderAction` | Session-header Triage actions |
| `experimental_threadList` | Optional Triage section above the session list |
| `experimental_useSidebarThreadActions` | Open sessions from sidebar cards |
| `settings.experimental_set` | Persist the sidebar-card preference |

`experimental_scanPublicSdkOnly` is used only by the import-boundary test.
That test checks imports; it does not guarantee API stability or host compatibility.
Keep the experimental prefixes and verify these surfaces on the target BB version.

## Marketplace contribution

Prepare the contribution in `get-bb/marketplace` using its current schema and rules:

- ID `triage`, display name `Triage`, category `tasks-and-workflows`.
- Author GitHub account `MayankBansal12`.
- Public Git source with range `^0.1.0`, after the release tag exists.
- An outcome-led description with provider requirements and usage costs.
- A supported host icon or a vendored SVG, PNG, or WebP icon (at most 256 KB).
- Real plugin screenshots, at least 1200 pixels wide and at most 2 MiB each.
- Copy `PLUGIN_OVERVIEW.md` to `overview/triage.md` and reference it in the entry.
- Run the marketplace build, tests, v1 gate, and source checks before opening its PR.

Document the release source, checks, experimental SDK usage, screenshot contents,
and overview provenance in the marketplace PR. A preparation PR is not a release
or a guarantee of marketplace acceptance.

## Supplied screenshots

The original screenshots are included in `docs/screenshots/` and displayed in
README.md. The board is 1521 × 832 and the task composer is 1272 × 531; both meet
the marketplace width and size limits. The Updates image is 636 × 736 and is
suitable for the README, but needs a new capture at least 1200 pixels wide before
marketplace submission. Capture more of the surrounding window or use a higher
device pixel ratio; do not upscale the existing image just to pass the check.
