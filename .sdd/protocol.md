<!-- sdd:generated sha256=d7d98082c860f764a63aaeeb711e734373d2e13569257a5ed5d279d8a40d59c8 (sdd regenerates this file only while it is unchanged; edit freely) -->
# SDD protocol

This repo uses **Structured Vibe Coding** (`sdd`). Agents must follow this file plus `.sdd/active-context.md`. Do not invent a parallel process.

## Source of truth

| What | Where |
|------|--------|
| Process state | `changes/<id>/meta.yaml` (workflow, stage, gates) |
| Current task snapshot | `.sdd/active-context.md` |
| Non-negotiables | `memory/constitution.md` if present |
| Stable product/tech rules | `memory/*.md` (start at `memory/index.md` if present) |
| Stage artifacts | files in `changes/<id>/` for the active change |

## Required read order

1. `.sdd/active-context.md`
2. This file (`.sdd/protocol.md`)
3. `memory/constitution.md` if present (non-negotiables agents must not violate)
4. `meta.yaml` + artifacts for the **current stage** (and prior stages if needed)
5. `memory/index.md` (documentation map) if present, then linked memory pages when architecture or conventions matter

## Stage behavior

| Stage kind | Agent focus |
|------------|-------------|
| intent / feature / stories | Clarify scope; write short artifacts |
| design / lld / db / research / hl_arb | Specs and decisions; minimal product code |
| tasks | Break work into implementable checklist |
| implement | Code only for this change; follow tasks/acceptance |
| local_verify | Check acceptance; fix only; prepare for complete |
| brainstorm (optional) | Multiple approaches; parallel exploration; no final design yet |
| clarify_* (optional) | Ask clarifying questions; write Q&A; or tell human to skip |

## Optional stages

- Stages marked **optional** / kind `brainstorm` or `clarify` may be skipped:  
  `sdd skip <stage_id> -r "not needed"`
- Do **not** invent a skip by jumping stages. `sdd next` blocks on empty required stubs (e.g. design.md).
- If the tool falls back to an earlier stage, **complete that stage** before advancing again.

## Hard rules

1. **Do not skip hard gates.** If blocked, tell the human to run `sdd gate approve` (or fix the gate).
2. **Stay in scope** of the active change title/intent. No drive-by refactors or new features.
3. **Honor constraints** in `arb-decision.md`, design, and memory non-negotiables.
4. **Local verify** is part of done when the workflow has a verify stage: `sdd verify`.
5. Prefer small, reviewable diffs.
6. **Required stage artifacts must be substantive** — not empty templates. Design cannot be skipped via empty design.md.

## Commands (human / shell)

```bash
sdd status
sdd next
sdd agent              # print handoff
sdd agents refresh     # refresh active-context.md
sdd verify
sdd complete
```

## Out of scope for agents

- Replacing CI/CD or team process tools
- Deleting `.sdd` / completed change history
- Claiming complete without verify when required
