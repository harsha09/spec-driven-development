---
layout: home
title: Local Spec-Driven Development for AI coding
titleTemplate: sdd
description: sdd keeps your AI coding decisions in git. A simple CLI process coach for hotfixes, features, new products, and enterprise work. No IDE extension.
head:
  - - meta
    - name: description
      content: sdd keeps your AI coding decisions in git. A simple CLI process coach for hotfixes, features, new products, and enterprise work. No IDE extension.
hero:
  name: sdd
  text: Stop losing the “why”
  tagline: Your AI writes code fast. The reasons disappear into chat. sdd is a small CLI that keeps short notes next to your code — so you, your team, and the agent stay aligned.
  actions:
    - theme: brand
      text: Start in 10 minutes
      link: /tutorials/first-change
    - theme: alt
      text: What is sdd?
      link: /concepts/what-is-sdd
    - theme: alt
      text: npm package
      link: https://www.npmjs.com/package/@structured-vibe-coding/cli
features:
  - title: Simple commands
    details: "new → fill a short file → next → code → complete. You always know where you are with sdd status."
  - title: As light or as heavy as you need
    details: Tiny fix? Three steps. Real feature? A bit more. New product or big platform work? Longer path. Same tool.
  - title: Works with your AI
    details: Pick Copilot, Grok, Claude, or Ollama once. Use any editor. No marketplace extension required.
---

## Try it in three steps

Install from npm: **[@structured-vibe-coding/cli](https://www.npmjs.com/package/@structured-vibe-coding/cli)**

```bash
npm install -g @structured-vibe-coding/cli
cd your-app
sdd init --here --ai copilot          # or: grok | claude | ollama
sdd new "Fix empty list crash" -w hotfix -y --no-agent
# open the intent.md path it prints → paste a few real sentences →
sdd next --no-agent
```

Full walkthrough with a paste-ready example: **[Start in 10 minutes](./tutorials/first-change)**.

::: tip Learning tip
Add `--no-agent` the first time. You learn the process without the AI window popping up. Drop the flag later when you want the agent to help.
:::

---

## Which page should I open?

| I want to… | Open this |
|------------|-----------|
| **Learn sdd right now** | [Start in 10 minutes](./tutorials/first-change) |
| **Understand what it is** | [What is sdd?](./concepts/what-is-sdd) |
| **Build a new product from an idea** | [New product (greenfield)](./guides/greenfield) |
| **Add a feature to my app** | [Simple feature](./guides/simple-feature) |
| **Do serious / multi-team work** | [Enterprise path](./guides/enterprise) |
| **See the daily commands** | [Everyday loop](./guides/everyday-loop) |
| **Attach org design system / AST MCP** | [MCP sources](./guides/mcp) |
| **Slice this repo’s TypeScript with AST** | [Code context](./guides/code-context) |
| **Look up a command** | [CLI reference](./reference/cli) |

---

## What you need

| Need | Detail |
|------|--------|
| **Node.js** | 20 or newer (24 is nice) |
| **CLI package** | [@structured-vibe-coding/cli on npm](https://www.npmjs.com/package/@structured-vibe-coding/cli) |
| **An AI tool** | One of: GitHub Copilot, Grok, Claude Code, or Ollama |
| **Time** | About 10 minutes for the first loop |
| **Editor** | Whatever you already use |

---

## How it feels after the first run

You get a folder under `changes/` with a short write-up of the work, a status that moves when you run `sdd next`, and a habit your AI can follow next time.

Ready for the daily rhythm? → [Everyday loop](./guides/everyday-loop)
