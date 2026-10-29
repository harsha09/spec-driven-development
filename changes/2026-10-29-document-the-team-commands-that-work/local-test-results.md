# Local test results

> **Document the team commands that work** · `2026-10-29-document-the-team-commands-that-work`

These notes are not a QA sign-off. The person has not signed them.

| Check | Result |
| --- | --- |
| `sdd role room` | Exit 0. Printed the two active-room lines. |
| `sdd role room --stage=local_verify` | Exit 0. Printed the same room. |
| `sdd role room --stage local_verify` | Exit 1. `Unknown command local_verify`. |
| `sdd role room post --stage local_verify` with no text | Exit 1. Asked for TEXT. Did not say `Unknown command`. |
| The six pages | Edited. `sdd role room [change]` remains only in this change pack, as the sentence being corrected. |

`pnpm test` is the workspace command and is not stamped yet.
