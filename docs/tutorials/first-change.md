---
title: Spec-Driven Development CLI tutorial (10 minutes)
description: Install the sdd Spec-Driven Development CLI, run your first AI-friendly change pack, and finish a local loop—intent in git, not only in chat. Beginner tutorial.
---

# Spec-Driven Development CLI: start in 10 minutes

This tutorial is the fastest way to learn **sdd**, a **local Spec-Driven Development CLI** for **AI coding agents**. You’ll make a tiny change pack, write a few sentences **in the repo**, and finish. No enterprise process. No long theory.

By the end, intent and progress live as **markdown in git**—the same trail you and Copilot, Claude Code, Grok, Ollama, or Kilo Code can share.

| | |
|--|--|
| **Time** | About 10 minutes |
| **You need** | Node.js 24+ and a folder for an app (or an empty folder) |
| **Goal** | Feel the loop: start → write a note → next → finish |
| **Install** | [`@structured-vibe-coding/cli`](https://www.npmjs.com/package/@structured-vibe-coding/cli) on npm |

::: tip Stay calm
We’ll use `--no-agent` so nothing launches an AI window while you learn. You can turn the agent on later.
:::

::: info Other paths
New product? → [Greenfield](../guides/greenfield)
Bigger feature? → [Simple feature](../guides/simple-feature) after this tutorial
:::

---

## Step 1 — Install

Package on npm: **[@structured-vibe-coding/cli](https://www.npmjs.com/package/@structured-vibe-coding/cli)**

**Easiest (recommended):**

```bash
npm install -g @structured-vibe-coding/cli
sdd --help
```

**Or without a global install:**

```bash
npx @structured-vibe-coding/cli --help
```

If you use `npx`, put `npx @structured-vibe-coding/cli` wherever you see `sdd` below.

<details>
<summary>Building from this GitHub repo instead?</summary>

```bash
git clone https://github.com/harsha09/spec-driven-development.git
cd spec-driven-development
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install && pnpm build
pnpm --filter @structured-vibe-coding/cli link --global
sdd --help
```

</details>

---

## Step 2 — Go to your app

```bash
cd ~/projects/my-app
# or: mkdir demo-app && cd demo-app
```

`sdd` lives **next to** your code. It doesn’t replace React, Python, etc.

---

## Step 3 — One-time setup

The shortest start lets sdd create three roles and walk the change:

```bash
sdd setup --no-agent
sdd go "Fix empty list crash" --no-agent
sdd go --answer "People who open an empty list" --no-agent
```

`sdd setup` writes three roles when `.sdd/roles` is empty:

| Role | Duty | What you get |
|------|------|----------------|
| planner | planning | Asks who this is for, and how you will know it worked |
| architect | architecture | Asks which module owns the change, and names the modules |
| builder | construction | Takes the tasks and the implementation note |

That split is the mapping: each duty follows the stages of the `feature` workflow. `sdd go` asks one question at a time. With `SDD_ROLE_MODEL` set, the role writes the note and the guide hands the next stage to the next role. A hard gate that needs you stops. The role does not sign it.

What the duties are, why they help, and how to point them at another workflow or a software team: [Roles and duties](../guides/roles).

Pick **one** AI tool when you want that host installed (you can change later):

| If you use… | Run |
|-------------|-----|
| GitHub Copilot | `sdd init --here --ai copilot` |
| Grok | `sdd init --here --ai grok` |
| Claude Code | `sdd init --here --ai claude` |
| Ollama (local) | `sdd init --here --ai ollama` then `ollama pull llama3.2` |
| Kilo Code | `sdd init --here --ai kilo` |

```bash
sdd init --here --ai copilot
sdd doctor
```

You want green checks from `sdd doctor`. After init you should see folders like `.sdd/`, `memory/`, and `changes/`.

---

## Step 4 — Start a tiny change

```bash
sdd new "Fix empty list crash" -w hotfix -y --no-agent
```

| Flag | Why |
|------|-----|
| `-w hotfix` | Shortest path (great for learning) |
| `-y` | Don’t ask extra questions |
| `--no-agent` | Don’t open the AI yet |

The tool prints a path to a file. That’s your **intent** file — the short note for this work.

Check where you are anytime:

```bash
sdd status
```

You should see something like:

```text
Workflow: hotfix

Stages:
  [●] intent — Intent
  [ ] implement — Implement
  [ ] local_verify — Local smoke
```

---

## Step 5 — Write a few real sentences

Open `intent.md` under `changes/<something>/` and **replace** the template with:

```markdown
# Intent

Empty expenses list crashes the page with a null reference.

Fix: show an empty state when there are zero rows instead of throwing.

Success: open expenses with no data — no error, empty state UI visible.
```

That’s enough. Empty templates block the next step on purpose — so the note is real, not a placeholder.

---

## Step 6 — Move forward and finish

```bash
sdd next --no-agent
# stage is now "implement" — fix the bug (or skip real code in a demo folder)
sdd next --no-agent
sdd complete --no-agent
```

**You’re done when** `sdd status` no longer shows this as the active in-progress work (or the change’s status is completed).

---

## If something goes wrong

| What you see | What to do |
|--------------|------------|
| `sdd: command not found` | Install again, or use `npx @structured-vibe-coding/cli …` |
| `next` says the file is incomplete | Paste the sample intent above into `intent.md` |
| Unsure if setup is OK | Run `sdd doctor` |
| Want a different AI | `sdd agents install --ai grok --force` (or copilot / claude / ollama / kilo) |

---

## What you just learned

| Command | Meaning |
|---------|---------|
| `sdd init` | One-time project setup |
| `sdd new` | Start a piece of work |
| `sdd status` | Where am I? |
| `sdd next` | This step is done; go to the next |
| `sdd complete` | This piece of work is finished |

### Words

| Word | Meaning |
|------|---------|
| Change pack | One folder for this task (`changes/…`) |
| Stage | One step, such as describe, code, or check |
| Workflow | Which path: `hotfix`, `feature`, `greenfield`, or `enterprise-feature` |
| Memory | Product notes that outlive one change (`memory/`) |
| Agent | The AI (Copilot, Grok, Claude, Ollama, or Kilo), not the editor |

---

## What next?

| I want to… | Go here |
|------------|---------|
| Use the same loop every day | [Everyday loop](../guides/everyday-loop) |
| Turn the AI on after process steps | [AI agents setup](../guides/agents) |
| Ship a real feature | [Simple feature](../guides/simple-feature) |
| Start a product from one sentence | [Greenfield](../guides/greenfield) |
