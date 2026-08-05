---
title: New product from a one-line idea
description: Turn a one-line product idea into vision, requirements, a feature list, and architecture with sdd greenfield — then build each feature one at a time.
---

# New product from a one-line idea

You have a **sentence**, not a backlog. Greenfield helps you write a small product plan *before* you drown in code — then you build **one feature at a time**.

| | |
|--|--|
| **Best for** | Empty repo / brand-new MVP |
| **You’ll get** | Notes in `memory/` + a list of features like F-001 |
| **Not for** | A single bug on an existing app → use [simple feature](./simple-feature) or a hotfix |

> **Picture it:** idea → short plan → list of features → simple architecture → implement F-001, F-002, …

---

## When to use which path

| Situation | Command |
|-----------|---------|
| New product discovery | `sdd greenfield "…"` then `sdd complete` |
| Next item from product backlog | `sdd backlog start F-001` |
| Feature on existing app (no backlog) | [Simple feature](./simple-feature) → `sdd new "…"` |
| Tiny fix | `sdd new "…" -w hotfix -y` |

---

## 1. One-time setup

```bash
cd your-app   # or an empty folder
sdd init --here --ai copilot    # or grok | claude | ollama
sdd doctor
```

---

## 2. Start from your idea

```bash
sdd greenfield "Team expense tracker for remote startups"
```

You’ll walk four steps (fill a short file each time):

1. **Vision** — who is it for, problem, how you know MVP worked  
2. **Requirements** — clear “must / should” statements  
3. **Features** — small items `F-001`, `F-002`, … (one PR each)  
4. **Architecture** — simple system shape (keep it modest)

```bash
# After writing each file:
sdd next
# … until architecture is done …
sdd complete
```

When you complete, good content is copied into **`memory/`** so later work can reuse it:

| You wrote | Saved as |
|-----------|----------|
| vision | `memory/product.md` |
| requirements | `memory/requirements.md` |
| features | `memory/features.md` |
| architecture | `memory/architecture.md` |

---

## 3. Build features one by one

```bash
sdd backlog list
sdd backlog start F-001
# normal loop: notes → sdd next → code → sdd verify → sdd complete
sdd backlog start F-002
```

Each start creates a normal change folder and marks that backlog row **in progress**.  
(Ad-hoc work that is *not* on the backlog still uses `sdd new "…"`.)

---

## How to write a feature row

```markdown
## F-001: Capture expense

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** User adds amount, category, and photo receipt.
- **Requirements:** R-001
- **Notes:** Mobile first
```

Headings must look like `## F-001: Short name` so the tool can read them.

---

## Friendly tips

- Keep vision **small** — the smallest useful product.  
- One feature ≈ one PR.  
- Blank templates don’t get saved into memory — write real sentences.  
- First time with sdd? The [10-minute tutorial](../tutorials/first-change) still helps.

---

## Limits (v1)

| Works today | Not automatic yet |
|-------------|-------------------|
| List and start F-001… | Marking features `done` when a pack completes |
| Promote plan into memory | Syncing edits both ways forever |
| Choose workflow per feature | Multiple products in one repo |

When a feature ships, set **Status** to `done` in `memory/features.md` by hand (for now).

---

## Related

- [What is a change pack?](../concepts/change-packs)  
- [Simple feature](./simple-feature)  
- [Everyday loop](./everyday-loop)  
- [CLI reference](../reference/cli)  
