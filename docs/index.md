---
layout: home
title: Spec-Driven Development CLI for AI Coding Agents
titleTemplate: sdd
description: sdd is a local Spec-Driven Development CLI for AI coding agents. Keep intent, design, and verify notes in git—not only in chat. Works with Copilot, Claude Code, Grok, and Ollama.
head:
  - - meta
    - name: description
      content: sdd is a local Spec-Driven Development CLI for AI coding agents. Keep intent, design, and verify notes in git—not only in chat. Works with Copilot, Claude Code, Grok, and Ollama.
hero:
  name: sdd
  text: Spec-Driven Development for AI coding agents
  tagline: Your AI writes code fast. The reasons disappear into chat. sdd is a local CLI that keeps short plans and notes next to your code—so you, your team, and the agent stay aligned.
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

## Local Spec-Driven Development in your repo

**sdd** (Structured Vibe Coding) is a **Spec-Driven Development CLI** for people who use **AI coding agents**. It does not host process in the cloud and does not require an IDE extension. Plans, stage progress, and handoffs live as **markdown in git**—next to the code your agent changes.

If chat history is where your “why” dies, this tool is for you.

## Try it in three steps

Install from npm: **[@structured-vibe-coding/cli](https://www.npmjs.com/package/@structured-vibe-coding/cli)** (binary: `sdd`)

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
| **Understand the problem it solves** | [Keep AI coding decisions in git](./concepts/keep-ai-coding-in-git) |
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
