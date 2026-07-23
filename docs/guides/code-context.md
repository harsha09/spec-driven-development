# Code context (AST slices)

> **What:** Structure-aware TS/JS slices for agents — symbols and imports, not whole-repo dumps.

## Problem · Solution · Benefit

| | |
|--|--|
| **Problem** | Agents get huge, noisy context or miss the right function. |
| **Solution** | `sdd context` builds ranked slices via TypeScript AST (local, on-demand). |
| **Benefit** | Smaller prompts, clearer focus, secrets denied by path. |

## What / When / How

| | |
|--|--|
| **What** | `sdd context` |
| **When** | Implement / review product code; optional before agent coding |
| **How** | |

```bash
# Symbol-focused
sdd context --path packages/core/src/agent-handoff.ts --symbol buildAgentPrompt --stdout

# Write into active change pack
sdd context --path src/app.ts --symbol main --out change
# → changes/<id>/code-context.md

# JSON summary
sdd context -p src/foo.ts -s bar --json
```

## PREP

**Point:** Prefer slices over paste-the-monorepo.

**Reason:** Caps (files, lines, tokens) keep agent context bounded.

**Example:** Handoff on implement/local_verify **points** at `sdd context`; it does **not** auto-run the pipeline on every status.

**Point:** Regenerate with `--out change` when code moves.

## Now what

- [CLI flags](/reference/cli)  
- [Refine specs first](/guides/refine) if the task list is still fuzzy  
