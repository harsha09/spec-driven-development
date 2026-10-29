# Design

> **Give each role a context from the developer or the repo** · `2026-10-29-give-each-role-a-context-from-the-developer-or-the-repo`

This is a proposal. The person has not signed it.

| Piece | Change |
| --- | --- |
| `.sdd/role-context/<name>/context.md` | Saved context. `source` is `provided` or `generated` |
| `.sdd/role-context/<name>/knowledge.md` | Optional knowledge the developer saved |
| `sdd role context` | Prints the saved context. `--text` stores what the developer wrote. `--knowledge` stores knowledge. `--generate` rebuilds from the repo |
| Repo text | Files under `src`, `packages`, or `lib` whose path matches the role name, job, or knowledge. A search slice is used when one exists. Otherwise the matching file text is kept, up to 40 lines |
| `sdd role run` | Adds `Context:` when a context is saved. The team brain drops that block when the budget is already full |
| Delete | `sdd role delete` removes the context directory |

A provided context stays until the developer passes `--generate` or writes a new `--text`.
