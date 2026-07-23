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
  - title: What
    details: sdd is a local Spec-Driven Development CLI. It owns process state (stages, artifacts, gates). Your AI agent owns writing specs and code.
  - title: So what
    details: Agents stop free-styling the whole app without a trail. You get change packs, verify, and complete — without cloud lock-in or a fixed enterprise pipeline.
  - title: Now what
    details: Install the CLI, run sdd init with one AI host, open the first-change tutorial, and finish a hotfix loop on your laptop.
---

## Intent in one breath

**Point:** Give engineers a **portable process** next to the app — not another IDE, not a SaaS.

**Reason:** Pure vibe coding loses decisions; pure heavy SDD kills speed. `sdd` sits in the middle: YAML workflows, markdown packs, local verify.

**Example:**

```bash
npm i -g @structured-vibe-coding/cli   # or build from source
cd my-app
sdd init --here --ai grok
sdd new "Fix empty-state crash" -w hotfix -y
# agent + you fill intent → next → implement → verify → complete
```

**Point again:** Structure when you need it; skip stages when you don’t.

---

## PSB — Problem · Solution · Benefit

| | |
|--|--|
| **Problem** | AI agents and humans ship without a durable “what we decided” trail; tools either over-process or under-document. |
| **Solution** | `sdd` change packs under `changes/<id>/`, workflows in YAML, one AI host at init (Grok / Copilot / Claude), local `verify` / `complete`. |
| **Benefit** | Faster onboarding to *this* PR’s context, clearer handoffs, still laptop-only. |

---

## What · When · How

| | |
|--|--|
| **What** | CLI `sdd` + agent stubs + `.sdd` process files |
| **When** | Every non-trivial change (feature, hotfix, spike) you want remembered |
| **How** | `init` → `new` → fill stage artifacts → `next` / `refine` → `verify` → `complete` |

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

---

## How these docs are written

We use **Diátaxis** (tutorial / how-to / reference / explanation) plus engagement frames:

- **PREP** — Point · Reason · Example · Point  
- **PSB** — Problem · Solution · Benefit  
- **What / So what / Now what** — fact · meaning · action  
- **What / When / How** — scope · timing · steps  

Details: [How we write docs](/how-we-write).
