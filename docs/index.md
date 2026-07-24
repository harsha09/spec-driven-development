---
layout: home
title: Structured Vibe Coding
titleTemplate: sdd docs
hero:
  name: Structured Vibe Coding
  text: Local Spec-Driven Development for every team size
  tagline: A CLI process coach plus your AI coding agent — from a one-line hotfix to enterprise ARB. No IDE extension required.
  actions:
    - theme: brand
      text: What is sdd?
      link: /concepts/what-is-sdd
    - theme: alt
      text: Simple feature
      link: /guides/simple-feature
    - theme: alt
      text: Enterprise path
      link: /guides/enterprise
features:
  - title: What it is
    details: sdd is a local Spec-Driven Development tool. It owns stages, markdown change packs, and gates. Your AI agent writes the specs and code.
  - title: What you achieve
    details: Clear change history per PR, optional governance, agent handoffs that stay in the repo — without a cloud SDD product.
  - title: Who it is for
    details: Solo engineers, product teams, and enterprises. Light workflows for small work; full packs and hard gates when you need them.
---

## Start here

| Question | Page |
|----------|------|
| **What is this tool?** | [What is sdd](/concepts/what-is-sdd) |
| **What can I achieve?** | [What you can achieve](/concepts/what-you-can-achieve) |
| **Which AI agents?** | [Available agents](/reference/agents) |
| **Which workflows ship by default?** | [Built-in workflows](/reference/workflows) |
| **How do I build a simple feature?** | [Simple feature guide](/guides/simple-feature) |
| **What do I use for enterprise work?** | [Enterprise guide](/guides/enterprise) |
| **Full first-run walkthrough** | [First change tutorial](/tutorials/first-change) |
| **Command list** | [CLI reference](/reference/cli) |

## Quick start

```bash
# In your app (Node 20+; 24 recommended)
npm install -g @structured-vibe-coding/cli   # or npx @structured-vibe-coding/cli …
sdd init --here --ai copilot                 # or: grok | claude
sdd doctor
sdd new "Add CSV export" -w feature -y
# fill feature.md → sdd next … → implement → sdd verify → sdd complete
```

## Needs

| | |
|--|--|
| **Node.js** | 20+ (24 recommended) |
| **AI host** | GitHub Copilot, Grok Build, or Claude Code (**required** at `sdd init`) |
| **Time** | ~10 minutes for a first hotfix or small feature |
