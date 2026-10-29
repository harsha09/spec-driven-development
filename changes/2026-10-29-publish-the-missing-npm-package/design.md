# Design

> **Publish the missing npm package** · `2026-10-29-publish-the-missing-npm-package`

This is a proposal. The person has not signed it.

| File | Change |
| --- | --- |
| `scripts/publish-npm.sh` | Before publishing, if `npm view` already shows the version, skip that package. After a publish, retry `npm view` 20 times, 15 seconds apart. A "cannot publish over" error is success when the version then appears. |
| `scripts/ensure-unpublished-version.mjs` | Patch-bump only when core and the CLI both already have the version. |
| `docs/maintainers/ci-cd.md` | Describe those two rules. |

The release workflow file stays as it is. It already calls these scripts.
