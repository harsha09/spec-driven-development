# Local test results

> **Publish the missing npm package** · `2026-10-29-publish-the-missing-npm-package`

These notes are not a QA sign-off. The person has not signed them.

| Check | Result |
| --- | --- |
| `bash -n scripts/publish-npm.sh` | Exit 0 |
| `npm view` | Core lists 0.19.0. CLI latest is 0.18.0. CLI 0.19.0 is absent. |

`pnpm test` is the workspace command and is not stamped yet. The publish script was not run locally.
