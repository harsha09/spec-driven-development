# Design

> **Document the team commands that work** · `2026-10-29-document-the-team-commands-that-work`

This is a proposal. The person has not signed it.

| Page | Change |
| --- | --- |
| `docs/reference/cli.md` | Replace the room command forms with the ones that run |
| `docs/guides/everyday-loop.md` | Add a short optional team section |
| `docs/guides/agents.md` | Say a product team is a different set of files from the host stubs |
| `docs/index.md` | Add one row to the page table |
| `README.md` | Add the same optional commands |
| `packages/cli/README.md` | Add them on the page npm publishes |

The room sentences match a local run of the installed CLI:

- `sdd role room` prints the active room.
- `sdd role room --stage=<stage>` prints that stage.
- `sdd role room --stage <stage>` exits with `Unknown command`.
- `sdd role room <change>` exits with `Unknown command`.
- `sdd role room post` requires text and accepts `--change` and `--stage`.

No module changes. The help line still prints `[CHANGE]`. The reference says that word is read as a command.
