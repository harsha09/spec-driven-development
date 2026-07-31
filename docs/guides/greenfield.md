# Greenfield: new product from a one-line idea

Use this when you are **starting a product**, not fixing an existing app. SDD walks vision → requirements → feature backlog → architecture, then you implement each backlog item as a normal change pack.

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
# Fill vision.md with real sentences
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

`sdd feature start` creates a normal **feature** (or the workflow named in the backlog row), seeds the first artifact from the backlog summary, and sets that row’s **Status** to `in_progress`.

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
- You can still run `sdd new "…" -w greenfield` if you prefer the generic entry; `sdd greenfield` is the clearer UX.

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
