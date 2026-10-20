---
title: Build a simple feature with sdd
description: Friendly step-by-step for shipping a normal product feature with sdd — short notes, clear stages, then code and verify.
---

# Build a simple feature

You’re shipping a **real feature**, not a one-line typo. You want a short plan next to the PR — without a heavy enterprise process.

| | |
|--|--|
| **Best for** | Normal product work on an existing app |
| **You’ll get** | A folder under `changes/` + code + a local check |
| **First time with sdd?** | Do the [10-minute tutorial](../tutorials/first-change) first |

Brand-new product from a one-liner? → [Greenfield](./greenfield), then come back (or use `sdd backlog start F-001`).

---

## 1. One-time setup

```bash
cd your-app
sdd init --here --ai copilot    # or grok | claude | ollama
sdd doctor
```

---

## 2. Start the feature

```bash
sdd new "Add CSV export for reports" -w feature -y
```

The title can also recommend a workflow if you omit `-w feature`.

---

## 3. Walk the stages

Optional stages can be skipped while you are still on intent. That does not move the stage.

```bash
sdd skip clarify_intent -r "clear enough"
sdd skip brainstorm -r "one clear approach"
sdd skip clarify_design -r "design is clear"
sdd skip clarify_tasks -r "tasks are clear"

# replace feature.md
sdd next --no-agent
# replace design.md
sdd next --no-agent
# replace tasks.md
sdd next --no-agent
# write the code
sdd next --no-agent
# on local_verify: real cases in local-test-plan.md and real results in local-test-results.md
sdd complete --no-agent
```

`sdd verify` is optional here. With no `verify.commands`, it prints NOT RUN and does not satisfy those two files.

---

## Example `feature.md` (paste and edit)

```markdown
# Feature

Users need to download the current report as CSV for offline analysis.

## Users
Analysts who already can view the report in the app.

## Scope
- Export visible columns for the filtered result set
- Stream large results

## Non-goals
- PDF export
- Scheduled email of exports

## Success
Download completes for 10k rows without timeout; file opens in Excel.
```

::: warning Empty templates block you
`sdd next` wants real sentences (like above), not blank bullets. That’s intentional.
:::

---

## Handy extras

```bash
sdd refine                 # improve the current notes
sdd context --path … --symbol …   # focused code slices for the AI
sdd next --no-agent        # move stages without launching AI
```

---

## Related

- [Everyday loop](./everyday-loop)  
- [Greenfield](./greenfield)  
- [Enterprise path](./enterprise)  
- [Workflows](../reference/workflows)  
