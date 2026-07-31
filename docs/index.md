---
layout: home
title: Structured Vibe Coding
titleTemplate: sdd docs
hero:
  name: Structured Vibe Coding
  text: Local Spec-Driven Development for every team size
  tagline: A CLI process coach plus your AI coding agent — new product, simple feature, or enterprise ARB. No IDE extension required.
  actions:
    - theme: brand
      text: What is sdd?
      link: /concepts/what-is-sdd
    - theme: alt
      text: New product
      link: /guides/greenfield
    - theme: alt
      text: Simple feature
      link: /guides/simple-feature
    - theme: alt
      text: Enterprise
      link: /guides/enterprise
features:
  - title: What it is
    details: sdd is a local Spec-Driven Development tool. It owns stages, markdown change packs, and gates. Your AI agent writes the specs and code.
  - title: What you achieve
    details: Greenfield product spine in memory, clear change history per PR, optional governance, agent handoffs in the repo — no cloud SDD product.
  - title: Who it is for
    details: Solo engineers, product teams, and enterprises. Light workflows for small work; full packs and hard gates when you need them.
---

## Start here

Pick the path that matches your work:

| Situation | Start here |
|-----------|------------|
| **I am new — one small fix** | [First change tutorial](./tutorials/first-change) |
| **Brand-new product / empty repo** | [Greenfield guide](./guides/greenfield) |
| **Feature on an existing app** | [Simple feature](./guides/simple-feature) |
| **Platform / ARB / multi-team** | [Enterprise](./guides/enterprise) |

| Question | Page |
|----------|------|
| **What is this tool?** | [What is sdd](./concepts/what-is-sdd) |
| **What can I achieve?** | [What you can achieve](./concepts/what-you-can-achieve) |
| **Which AI agents?** | [Available agents](./reference/agents) |
| **Which workflows ship by default?** | [Built-in workflows](./reference/workflows) |
| **Command list** | [CLI reference](./reference/cli) |

## Quick start

**Existing app / one change:**

```bash
# In your app (Node 20+; 24 recommended)
npm install -g @structured-vibe-coding/cli   # or npx @structured-vibe-coding/cli …
sdd init --here --ai copilot                 # or: grok | claude | ollama
sdd doctor
sdd new "Add CSV export" -w feature -y
# fill feature.md → sdd next … → implement → sdd verify → sdd complete
```

**New product (one-line idea):**

```bash
sdd init --here --ai copilot
sdd greenfield "Team expense tracker for remote startups"
# vision → requirements → features → architecture → sdd complete
sdd feature list
sdd feature start F-001
```

## Needs

| | |
|--|--|
| **Node.js** | 20+ (24 recommended) |
| **AI host** | Copilot, Grok, Claude Code, or **Ollama** (**required** at `sdd init`) |
| **Time** | ~10 minutes for a first hotfix or small feature; longer for greenfield discovery |
