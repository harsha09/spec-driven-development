---
layout: home
title: Spec-Driven Development CLI for AI Coding Agents
description: "sdd (Structured Vibe Coding) is a local Spec-Driven Development CLI for AI coding agents. Package: @structured-vibe-coding/cli. Keep intent in git, not only in chat. Copilot, Claude Code, Grok, Ollama, Kilo Code."
hero:
  name: sdd
  text: Spec-Driven Development for AI coding agents
  tagline: Your AI writes code fast. The reasons disappear into chat. sdd is a local CLI that keeps short plans and notes next to your code—so you, your team, and the agent stay aligned.
  actions:
    - theme: brand
      text: Start in 10 minutes
      link: /tutorials/first-change
    - theme: alt
      text: npm package
      link: https://www.npmjs.com/package/@structured-vibe-coding/cli
features:
  - title: Simple commands
    details: "setup → go, or new → fill a short file → next → complete. You always know where you are with sdd status."
  - title: Roles with a duty
    details: "Planner, architect, and builder each follow the stages of the workflow you name. sdd go asks their questions, and with a role model it hands the next stage to the next role. You still decide."
  - title: As light or as heavy as you need
    details: Tiny fix? Three steps. Real feature? A bit more. New product or big platform work? Longer path. Same tool.
  - title: Works with your AI
    details: Pick Copilot, Grok, Claude, Ollama, or Kilo once. Use any editor. No marketplace extension required.
---

## Try it in three steps

Install **Structured Vibe Coding** from npm: **[@structured-vibe-coding/cli](https://www.npmjs.com/package/@structured-vibe-coding/cli)** (binary: `sdd`)

```bash
npm install -g @structured-vibe-coding/cli
cd your-app
sdd setup --no-agent
sdd go "Fix empty list crash" --no-agent
```

`sdd setup` writes three roles when you have no roles yet. A **role** is a job in the repo. A **duty** is the kind of work it does: the planner plans, the architect names the modules, and the builder builds the change pack. The **mapping** is which stages of the workflow you named belong to that duty. `sdd go` asks their questions one at a time. With `SDD_ROLE_MODEL` set, the role writes the note and the guide hands the next stage to the next role. You still decide.

What they are, why that split helps, and the setup for a software team: **[Roles and duties](./guides/roles)**.

A named host is `sdd setup --ai copilot`, or `sdd init --here --ai copilot` when you want to pick the workflow yourself.

Full walkthrough with a paste-ready example: **[Start in 10 minutes](./tutorials/first-change)**.

::: tip Learning tip
Add `--no-agent` the first time. You learn the process without the AI window popping up. Drop the flag later when you want the agent to help.
:::

---

## Which page should I open?

| I want to… | Open this |
|------------|-----------|
| **Learn sdd right now** | [Start in 10 minutes](./tutorials/first-change) |
| **Set up roles and duties** | [Roles and duties](./guides/roles) |
| **See the daily commands** | [Everyday loop](./guides/everyday-loop) |
| **Add a feature to my app** | [Simple feature](./guides/simple-feature) |
| **Build a new product from an idea** | [New product (greenfield)](./guides/greenfield) |
| **Do serious / multi-team work** | [Enterprise path](./guides/enterprise) |
| **Look up a command** | [CLI reference](./reference/cli) |
| **Name a team in the repo** | [Roles and duties](./guides/roles) |

---

## What you need

| Need | Detail |
|------|--------|
| **Node.js** | 24 or newer |
| **CLI package** | [@structured-vibe-coding/cli on npm](https://www.npmjs.com/package/@structured-vibe-coding/cli) |
| **An AI tool** | One of: GitHub Copilot, Grok, Claude Code, Ollama, or Kilo Code |
| **Time** | About 10 minutes for the first loop |
| **Editor** | Whatever you already use |

---

## How it feels after the first run

You get a folder under `changes/` with a short write-up of the work, a status that moves when you run `sdd next`, and a habit your AI can follow next time.

Ready for the daily rhythm? → [Everyday loop](./guides/everyday-loop)
