---
layout: home
title: Structured Vibe Coding
titleTemplate: sdd docs
hero:
  name: Structured Vibe Coding
  text: Spec-driven process for humans + AI agents
  tagline: Local CLI. Your coding agent. Just enough structure for real PRs. No IDE extension required.
  actions:
    - theme: brand
      text: First change tutorial
      link: /tutorials/first-change
    - theme: alt
      text: Why sdd exists
      link: /concepts/why-sdd
    - theme: alt
      text: CLI reference
      link: /reference/cli
features:
  - title: Process next to the app
    details: sdd owns stages and markdown packs. Your AI agent owns writing specs and code. Use any editor.
  - title: A trail you can trust
    details: Each PR gets a change pack so decisions don’t vanish into chat history — fully on your laptop.
  - title: Start in about 10 minutes
    details: Needs Node 20+. Init once, paste a short intent, run next until complete. sdd doctor checks your setup.
---

## The idea

You need a **portable process** beside the app — not another IDE, not a SaaS.

Pure vibe coding loses decisions. Heavy process kills speed. `sdd` sits in the middle: small workflows, markdown packs, local verify.

```bash
# In your app:
npx @structured-vibe-coding/cli init --here --ai copilot   # or: npm i -g … then sdd
sdd new "Fix empty-state crash" -w hotfix -y --no-agent
# open the path it prints → paste a few sentences → sdd next → … → sdd complete
```

Structure when you need it; skip stages when you don’t.

---

## Before you start

| Need | Notes |
|------|--------|
| **Node.js** | 20+ (24 recommended) |
| **Time** | ~10 minutes for the first loop |
| **AI (optional)** | Copilot, Grok Build, or Claude Code — or `--no-agents` to learn process first |
| **Check setup** | `sdd doctor` after init |

---

## I want to…

| Goal | Go here |
|------|---------|
| **Do it now** (tutorial) | [First change](/tutorials/first-change) |
| Everyday commands | [Everyday loop](/guides/everyday-loop) |
| Pick / switch AI host | [Agents](/guides/agents) |
| Improve specs mid-flight | [Refine](/guides/refine) |
| Code slices for agents | [Code context](/guides/code-context) |
| Look up a command | [CLI reference](/reference/cli) |
| Understand the design | [Why sdd](/concepts/why-sdd) |
| Team scenarios | [Scenario evaluation](/scenarios/evaluation) |
| Ship this monorepo | [CI / CD](/maintainers/ci-cd) |
