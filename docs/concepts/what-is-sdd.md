---
title: What is sdd?
description: sdd is a local Spec-Driven Development CLI — a process coach for you and your AI coding agent. Stages, change packs, and memory in git. No cloud product, no IDE extension.
---

# What is sdd?

Your AI can write a feature before lunch. By Friday the PR is merged and the *decision trail* is gone — buried in chat, half-remembered standups, or a wiki nobody opened.

**`sdd` (Structured Vibe Coding)** is a **local Spec-Driven Development CLI**. It is a process coach that lives in your app repo. It does not replace React, Python, or your stack. It adds a thin spine so you and the agent share the same stages, files, and definition of done.

> **One line:** the agent is the writer; `sdd` is the spine.

## Picture the loop

```text
  You decide scope          sdd owns stages           AI writes specs & code
        │                         │                            │
        ▼                         ▼                            ▼
  sdd new / greenfield  →  fill markdown  →  sdd next  →  implement  →  verify  →  complete
                                │
                                ▼
                     changes/<id>/  +  memory/  (in git)
```

| Piece | Job |
|-------|-----|
| **You** | Scope, quality bar, when to advance |
| **`sdd` CLI** | Stages, gates, handoff files, status |
| **AI coding agent** | Drafts and implements (Copilot, Grok, Claude, or Ollama) |
| **Your editor** | Edit files — **no** special IDE extension |

## What it adds to a repo

1. **Workflows** — ordered stages. A typo stays short; a feature or ARB goes deeper.  
2. **Change packs** — one folder per unit of work under `changes/<id>/` (markdown + `meta.yaml`).  
3. **Product memory** — durable truths under `memory/` (constitution; after greenfield: product, backlog, architecture).  
4. **One AI host** — thin stubs + a single playbook (`.sdd/protocol.md`).  
5. **Local verify & complete** — done on your machine; pack stays under `changes/` by default.

## Three ways in

| Situation | Command | You walk away with |
|-----------|---------|-------------------|
| Small fix | `sdd new "…" -w hotfix` | Intent → code → smoke, in minutes |
| Existing product feature | `sdd new "…" -w feature` | Spec → design → tasks → code → verify |
| **Brand-new product** | `sdd greenfield "one-line idea"` | Vision → backlog → architecture → then `sdd feature start F-001` |

## What it is not

- Not a required VS Code / IntelliJ extension  
- Not a hosted multi-tenant SaaS  
- Not a replacement for Jira or Git as company systems of record  
- Not “install every AI host at once” — you pick **one** at `sdd init`

## Feel it before you theorize

If you have ten minutes, skip the rest of the concepts and run the happy path:

**→ [Your first change (tutorial)](../tutorials/first-change)**

## Related

- [Why sdd exists](./why-sdd) — the pain and the bet  
- [What you can achieve](./what-you-can-achieve)  
- [Change packs & memory](./change-packs)  
- [Greenfield](../guides/greenfield) · [Workflows](../reference/workflows) · [Agents](../reference/agents)  
