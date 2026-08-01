---
layout: home
title: Local Spec-Driven Development for AI coding
titleTemplate: sdd
description: Your AI ships code in minutes. The decisions evaporate. sdd is a local CLI process coach that keeps intent, design, and verify notes in git — hotfix to greenfield to enterprise ARB. No IDE extension.
head:
  - - meta
    - name: description
      content: Your AI ships code in minutes. The decisions evaporate. sdd is a local CLI process coach that keeps intent, design, and verify notes in git — hotfix to greenfield to enterprise ARB.
hero:
  name: sdd
  text: The process spine for AI coding
  tagline: Your agent writes fast. Decisions still get lost. Keep the trail next to the code — stages, markdown packs, one AI host. No cloud SDD product. No IDE extension.
  actions:
    - theme: brand
      text: Your first change · 10 min
      link: /tutorials/first-change
    - theme: alt
      text: What is sdd?
      link: /concepts/what-is-sdd
    - theme: alt
      text: Why it exists
      link: /concepts/why-sdd
features:
  - title: Feel the win in ten minutes
    details: Init once, open a tiny hotfix pack, paste three sentences of intent, run sdd next. You will see stages move — process without a second career in process.
  - title: Match ceremony to risk
    details: Typo? Three stages. Real feature? Design and tasks. New product? Vision and backlog. Enterprise? ARB hard gates. Same CLI.
  - title: Agents write. You own the trail.
    details: Copilot, Grok, Claude, or Ollama — one host at init. Specs and verify notes live in git where reviewers already look.
---

## The problem in one breath

Vibe coding ships. Then nobody remembers *why* that edge case was “fine,” what success meant, or what was out of scope. Heavy SDD tools fix that — and often feel like a second job.

**`sdd` is the middle path:** a local process coach in your terminal. You and your AI fill short markdown files; the CLI moves you through stages and hands the agent a live brief.

---

## Start here

| You are… | Go here |
|----------|---------|
| **New — I want a win today** | [Your first change (10 min)](./tutorials/first-change) |
| **Starting a brand-new product** | [Greenfield from a one-line idea](./guides/greenfield) |
| **Adding a feature to an existing app** | [Simple feature guide](./guides/simple-feature) |
| **Doing platform / ARB / multi-team work** | [Enterprise path](./guides/enterprise) |

| Question | Page |
|----------|------|
| What is this, in plain language? | [What is sdd](./concepts/what-is-sdd) |
| Why not just chat with the agent? | [Why sdd exists](./concepts/why-sdd) |
| What can my team actually achieve? | [What you can achieve](./concepts/what-you-can-achieve) |
| Which AI hosts? | [Available agents](./reference/agents) |
| Command list | [CLI reference](./reference/cli) |

---

## Quick start

**First loop (hotfix — learn the tool):**

```bash
npm install -g @structured-vibe-coding/cli   # Node 20+; 24 recommended
cd your-app
sdd init --here --ai copilot                 # or: grok | claude | ollama
sdd doctor
sdd new "Fix empty list crash" -w hotfix -y
# paste real intent into changes/<id>/intent.md  →  sdd next  →  implement  →  sdd complete
```

Prefer a guided walkthrough with a paste-ready sample? → **[Your first change](./tutorials/first-change)**.

**New product (one-line idea):**

```bash
sdd greenfield "Team expense tracker for remote startups"
# vision → requirements → features → architecture → sdd complete
sdd feature list && sdd feature start F-001
```

Full path: [Greenfield guide](./guides/greenfield).

---

## Needs

| | |
|--|--|
| **Node.js** | 20+ (24 recommended) |
| **AI host** | Copilot, Grok, Claude Code, or Ollama at `sdd init` (required) |
| **Time** | ~10 minutes for the first hotfix loop |
| **Editor** | Any — no extension |

Learn process without the agent launching every time: add `--no-agent` (or `SDD_NO_AGENT=1`).

---

## What people say after the first loop

You will not get a new IDE. You will get a folder under `changes/` with intent, a status line that moves, and a habit your agent can follow next time.

When you are ready for the daily rhythm: [Everyday loop](./guides/everyday-loop).
