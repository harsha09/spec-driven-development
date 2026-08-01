---
title: Start with sdd in 10 minutes
description: Install sdd, create a small change, write a few sentences, and finish your first loop — step by step for beginners.
---

# Start in 10 minutes

This is the friendliest way to learn **sdd**. You’ll make a tiny “change,” write a few sentences, and finish. No enterprise process. No long theory.

| | |
|--|--|
| **Time** | About 10 minutes |
| **You need** | Node.js 20+ and a folder for an app (or an empty folder) |
| **Goal** | Feel the loop: start → write a note → next → finish |

::: tip Stay calm
We’ll use `--no-agent` so nothing launches an AI window while you learn. You can turn the agent on later.
:::

::: info Other paths
New product? → [Greenfield](../guides/greenfield)  
Bigger feature? → [Simple feature](../guides/simple-feature) after this tutorial  
:::

---

## Step 1 — Install

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

Pick **one** AI tool (you can change later):

| If you use… | Run |
|-------------|-----|
| GitHub Copilot | `sdd init --here --ai copilot` |
| Grok | `sdd init --here --ai grok` |
| Claude Code | `sdd init --here --ai claude` |
| Ollama (local) | `sdd init --here --ai ollama` then `ollama pull llama3.2` |

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
Stage:    intent
[●] intent
[ ] implement
[ ] local_verify
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
| Want a different AI | `sdd agents install --ai grok --force` (or copilot / claude / ollama) |

---

## What you just learned

| Command | Meaning |
|---------|---------|
| `sdd init` | One-time project setup |
| `sdd new` | Start a piece of work |
| `sdd status` | Where am I? |
| `sdd next` | This step is done; go to the next |
| `sdd complete` | This piece of work is finished |

---

## What next?

| I want to… | Go here |
|------------|---------|
| Use the same loop every day | [Everyday loop](../guides/everyday-loop) |
| Turn the AI on after process steps | [AI agents setup](../guides/agents) |
| Ship a real feature | [Simple feature](../guides/simple-feature) |
| Start a product from one sentence | [Greenfield](../guides/greenfield) |
