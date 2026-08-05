---
title: Keep AI coding decisions in git
description: AI coding agents write fast, but intent dies in chat. Local Spec-Driven Development (sdd) keeps plans, stages, and handoffs in git so Copilot, Claude Code, Grok, and Ollama share the same trail.
---

# Keep AI coding decisions in git

**AI coding agents** (GitHub Copilot, Claude Code, Grok, Ollama, and similar tools) can change a lot of code before lunch. By the next day, the hard parts—why that edge case was “fine,” what was out of scope, what “done” meant—are often **only in a chat thread**.

That is not a model problem. It is a **process and storage** problem.

**Local Spec-Driven Development** means: short specs and progress live **in your repository**, next to the code, so humans and agents read the same files. **sdd** is a CLI that runs that process without a cloud process product or a required IDE extension.

---

## The failure mode of chat-only coding

| What happens | Why it hurts |
|--------------|--------------|
| Decisions stay in the agent chat | New chats (or new teammates) start from zero |
| PRs show diffs, not intent | Reviewers re-discover the “why” from code alone |
| Context windows fill with source | Plans get compressed away; constraints are forgotten |
| Process is “vibe” until it isn’t | Hotfixes and platform work need different depth |

If this feels familiar, you do not need a heavier enterprise ALM suite for every three-line fix. You need a **light spine in git**.

---

## What local Spec-Driven Development looks like

1. Start a piece of work (`sdd new "…"`, or `sdd greenfield` for a new product).  
2. Fill a **short markdown** file (intent, design, tasks—not a novel).  
3. Advance with `sdd next` when the step is real.  
4. Implement, verify, then `sdd complete`.  

Notes for *this* PR live under `changes/`. Product truths that should last live under `memory/` (constitution, backlog after greenfield, thin architecture).

```text
Chat / agent window          Your repo (source of truth)
        │                              │
        │     sdd handoff + packs      │
        └─────────────────────────────►│  changes/ · memory/ · .sdd/
```

Agents get a **handoff** and host rules; you still own the process with the CLI.

---

## How sdd fits (and what it is not)

| sdd is | sdd is not |
|--------|------------|
| A **Spec-Driven Development CLI** (`npm i -g @structured-vibe-coding/cli`) | A cloud ticket system |
| Process coach for **you + your AI coding agent** | A replacement for your framework or IDE |
| Markdown in git, progressive workflows (hotfix → enterprise) | One rigid ceremony for every change |
| Optional **MCP sources** sdd *calls* (design system, AST, APIs) | An inbound “drive sdd next from Cursor tools” server (by design) |

---

## Who this is for

- Solo and small teams using agents daily  
- Teams that want **decisions reviewable in PRs**  
- Greenfield MVPs that need a **vision → backlog → F-001** path  
- Groups that sometimes need **gates** without living in them  

Not for: people who want process only in a SaaS UI, or who refuse any markdown next to code.

---

## Try it in about 10 minutes

```bash
npm install -g @structured-vibe-coding/cli
cd your-app
sdd init --here --ai copilot    # or grok | claude | ollama
sdd new "Fix empty list crash" -w hotfix -y --no-agent
# write a few real sentences in the intent file
sdd next --no-agent
sdd complete --no-agent
```

Step-by-step: **[Start in 10 minutes](../tutorials/first-change)**.  
Product concept: **[What is sdd?](./what-is-sdd)**.  
Why this exists: **[Why sdd exists](./why-sdd)**.

---

## Related

- [Change packs & memory](./change-packs) — what to keep forever vs per PR  
- [Set up your AI](../guides/agents) — Copilot, Claude Code, Grok, Ollama  
- [Greenfield](../guides/greenfield) — new product from one sentence  
- [CLI reference](../reference/cli) — commands  
