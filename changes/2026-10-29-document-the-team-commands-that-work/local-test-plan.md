# Local test plan

> **Document the team commands that work** · `2026-10-29-document-the-team-commands-that-work`

This is a proposal. It is not a recorded result. The person has not signed it.

| Check | Expected |
| --- | --- |
| `sdd role room` | Prints the active room and exits 0 |
| `sdd role room --stage=<stage>` | Prints that stage and exits 0 |
| `sdd role room --stage <stage>` and `sdd role room <change>` | Exit 1 with `Unknown command` |
| `sdd role room post --stage <stage>` with no text | Exits 1 asking for TEXT, and does not say `Unknown command` |
| The six edited pages | Name `sdd role room` and `sdd role room post`. They do not contain `sdd role room [change]` |
| `pnpm test` | The workspace command exits 0 |
