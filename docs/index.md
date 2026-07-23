---
layout: home
title: Structured Vibe Coding
titleTemplate: sdd docs
hero:
  name: Structured Vibe Coding
  text: Spec-driven process for humans + AI agents
  tagline: Local CLI. Your coding agent. Just enough structure for real PRs — Spec Kit–style, no IDE extension required.
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
    details: sdd owns stages, artifacts, and gates. Your AI agent owns writing specs and code. No IDE extension required.
  - title: A trail you can trust
    details: Change packs capture decisions for this PR. Agents stop free-styling without a record — and you stay laptop-only.
  - title: Start in minutes
    details: Install the CLI, init with one AI host, walk the first-change tutorial, and complete a real hotfix loop.
---

## The idea

Engineers need a **portable process** beside the app — not another IDE, not a SaaS.

Pure vibe coding loses decisions. Heavy SDD kills speed. `sdd` sits in the middle: YAML workflows, markdown packs, local verify.

```bash
npm i -g @structured-vibe-coding/cli   # or build from source
cd my-app
sdd init --here --ai grok
sdd new "Fix empty-state crash" -w hotfix -y
# fill intent → next → implement → verify → complete
```

Structure when you need it; skip stages when you don’t.

---

## Who it’s for

Teams that ship with AI agents and still want a durable “what we decided” trail for each PR — without cloud lock-in or a fixed enterprise pipeline.

`sdd` gives you change packs under `changes/<id>/`, workflows in YAML, one AI host at init (Grok / Copilot / Claude), and local `verify` / `complete`.

---

## At a glance

| | |
|--|--|
| **Tool** | CLI `sdd` + agent stubs + `.sdd` process files |
| **Use it** | Any non-trivial change you want remembered (feature, hotfix, spike) |
| **Flow** | `init` → `new` → fill stage artifacts → `next` / `refine` → `verify` → `complete` |

---

## I want to…

| Goal | Go here |
|------|---------|
| Learn by doing (10 min) | [Tutorial: first change](/tutorials/first-change) |
| Pick / switch AI host | [Guide: agents](/guides/agents) |
| Improve specs mid-flight | [Guide: refine](/guides/refine) |
| Feed agents code slices (AST) | [Guide: code context](/guides/code-context) |
| Look up a command | [CLI reference](/reference/cli) |
| Understand the design intent | [Why sdd](/concepts/why-sdd) |
| See team scenarios | [Scenario evaluation](/scenarios/evaluation) |
| Ship this monorepo | [CI / CD](/maintainers/ci-cd) |
