# Local test plan

> **Give each role a context from the developer or the repo** · `2026-10-29-give-each-role-a-context-from-the-developer-or-the-repo`

This is a proposal. It is not a recorded result. The person has not signed it.

| Check | Expected |
| --- | --- |
| `--text` for a role | The same text is printed again. A blank text is refused |
| `--knowledge` then `--generate` | The context names the role, the job, the knowledge, and a matching file under `src` |
| A secret in `.env` | The generated context omits that secret |
| `sdd role run` with saved context | The prompt includes `Context:` |
| A team brain with a budget of one token | The context is left out |
| `sdd role delete` | The context directory is removed |
| `pnpm test` | Exits 0 |
