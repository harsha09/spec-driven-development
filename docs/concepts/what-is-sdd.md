---
title: What is sdd?
description: sdd is a simple CLI that keeps short plans and notes next to your code so you and your AI coding agent stay aligned. No cloud product, no IDE extension.
---

# What is sdd?

Your AI can ship a feature before lunch. By Friday, nobody remembers *why* that edge case was “fine,” what “done” meant, or what was out of scope.

**`sdd`** is a small program you run in the terminal. It lives in your project and helps you and your AI work in **short, clear steps** — with notes saved in the repo, not only in a chat window.

It does **not** replace your stack (React, Python, …). It sits **next to** your code.

> **In one sentence:** the AI writes; `sdd` keeps the plan and progress.

---

## The idea in 30 seconds

1. You start a piece of work (`sdd new` or `sdd greenfield`).  
2. You (or the AI) fill a short markdown file.  
3. You run `sdd next` when that step is done.  
4. You write code, check it, and run `sdd complete`.

Everything for that work sits in a folder under `changes/`. Longer-lived product notes can live under `memory/`.

```text
You decide what to build     sdd tracks the steps      AI helps write notes & code
           │                          │                           │
           ▼                          ▼                           ▼
     sdd new "…"  →  edit a short file  →  sdd next  →  code  →  done
```

---

## Words you’ll see (plain English)

| Word | Meaning |
|------|---------|
| **Change pack** | One folder for *this* task or PR (`changes/…`) |
| **Stage** | One step on the path (e.g. “describe the fix”, then “code”, then “check”) |
| **Workflow** | Which path of stages you use (short fix vs feature vs new product) |
| **Memory** | Stable notes about the product (`memory/`) that last beyond one PR |
| **Agent** | Your AI coding tool (Copilot, Grok, Claude, Ollama) — not your editor |

---

## Who does what

| Who | Job |
|-----|-----|
| **You** | Decide scope, quality, and when to move on |
| **`sdd`** | Remember the step, create files, show status |
| **AI** | Draft notes and write code when you want help |
| **Your editor** | Edit files (no special plugin required) |

---

## Pick a path by situation

| Situation | Start with |
|-----------|------------|
| Small bug or typo | `sdd new "…" -w hotfix` |
| Normal feature | `sdd new "…" -w feature` |
| Brand-new product | `sdd greenfield "one-line idea"` |
| Big / multi-team change | `sdd new "…" -w enterprise-feature` |

---

## What it is *not*

- Not a required VS Code or IntelliJ extension  
- Not a cloud “process product” you must log into  
- Not a replacement for Jira or Git  
- Not “install every AI at once” — you pick **one** when you run `sdd init`

---

## Best next step

Don’t over-read. Run one tiny loop:

**→ [Start in 10 minutes](../tutorials/first-change)**

Want the “why”? → [Why sdd exists](./why-sdd)
