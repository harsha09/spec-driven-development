# Local test plan

> **Publish the missing npm package** · `2026-10-29-publish-the-missing-npm-package`

This is a proposal. It is not a recorded result. The person has not signed it.

| Check | Expected |
| --- | --- |
| `bash -n scripts/publish-npm.sh` | Exit 0 |
| `npm view` of the two packages | Core lists 0.19.0. The CLI latest is 0.18.0 |
| `pnpm test` | The workspace command exits 0 |

The publish script is not run locally. It needs the npm token, and a local run of the version guard would rewrite `package.json`.
