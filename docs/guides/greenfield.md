---
title: Greenfield — new product from a one-line idea
description: Bootstrap a new product with sdd greenfield — vision, requirements, feature backlog, architecture — then implement each F-001 item as a normal change pack.
---

# Greenfield: new product from a one-line idea

You have a **one-line idea**. You do not have a backlog, an architecture doodle, or six half-started repos.

Greenfield is the path that turns that sentence into a **product spine** — vision, testable requirements, PR-sized features, and a simple architecture — *before* you drown in implementation. Then each feature ships as its own change pack.

> **Outcome:** `memory/product.md`, requirements, `features.md` (F-001…), architecture — plus a habit your agent can follow on day two.

**Time:** discovery is a focused session (not ten minutes). Delivery packs after that use the normal feature loop.

## When to use

| Situation | Command |
|-----------|---------|
| Empty repo / new MVP | `sdd greenfield "…"` |
| Existing app, one feature | [Simple feature](./simple-feature) |
| Hotfix / typo | `sdd new "…" -w hotfix -y` |

## 1. Init (once)

```bash
cd your-app   # or empty folder
sdd init --here --ai copilot    # or grok | claude | ollama
sdd doctor
```

## 2. Start greenfield

```bash
sdd greenfield "Team expense tracker for remote startups"
```

That creates a **greenfield** change pack and seeds `vision.md` with your idea. Stages:

1. **vision** — who, problem, MVP success, non-goals  
2. **requirements** — testable shall/should statements  
3. **features** — PR-sized items `F-001`, `F-002`, …  
4. **architecture** — simple MVP shape (not enterprise scale)

```bash
# Fill vision.md with real sentences (smallest useful product)
sdd next
# Fill requirements.md
sdd next
# Fill features.md (keep Status: planned)
sdd next
# Fill architecture.md
sdd complete
```

On **complete**, substantive files promote into **memory/**:

| Change artifact | Memory file |
|-----------------|-------------|
| `vision.md` | `memory/product.md` |
| `requirements.md` | `memory/requirements.md` |
| `features.md` | `memory/features.md` |
| `architecture.md` | `memory/architecture.md` |

## 3. Implement the backlog

```bash
sdd feature list
sdd feature start F-001
# normal feature loop: fill stage docs → sdd next → implement → sdd verify → sdd complete
sdd feature start F-002
```

`sdd feature start` creates a normal **feature** pack (or the workflow named in the backlog row), seeds the first artifact from the summary, and sets that row’s **Status** to `in_progress`.

## Feature block format

```markdown
## F-001: Capture expense

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** User adds amount, category, and photo receipt.
- **Requirements:** R-001
- **Notes:** Mobile first
```

Headings must look like `## F-001: Short name` so the CLI can parse them.

## Tips

- Prefer the **smallest useful product** in vision; non-goals keep scope honest.  
- One feature ≈ one PR. Split “build the whole app” into F-001, F-002, …  
- After promote, agents read `memory/index.md` → product, requirements, features, architecture.  
- Re-init with `sdd init --force` to pick up the greenfield workflow if an older project lacks it (memory files are preserved).  
- Only **substantive** artifacts promote (empty templates are skipped).  
- `sdd greenfield` is the clear UX; `sdd new "…" -w greenfield` also works.

## Limits (v1)

| Supported | Not automated yet |
|-----------|-------------------|
| Parse `## F-001: Name` blocks + list/start | `sdd feature done` / auto-set Status to `done` on complete |
| Promote vision/requirements/features/architecture | Bidirectional sync if you edit memory and the old change pack |
| Override workflow with `-w` on `feature start` | Multi-product backlogs in one repo |

Update Status to `done` by hand in `memory/features.md` when a delivery pack ships, or extend the workflow later.

## Related

- [Change packs & memory](../concepts/change-packs)  
- [Simple feature](./simple-feature)  
- [Everyday loop](./everyday-loop)  
- [Built-in workflows](../reference/workflows)  
- [CLI reference](../reference/cli)  
