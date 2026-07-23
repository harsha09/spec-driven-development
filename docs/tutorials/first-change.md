# Tutorial: your first change

> In about ten minutes you’ll init `sdd`, start a hotfix pack, advance stages, and complete — on your laptop.

::: tip One path only
This page is a single happy path. Variants and escape hatches live in [guides](/guides/everyday-loop).
:::

## Why this works

`sdd` owns process; you and your AI agent own content.

Without a pack, agents reinvent scope every chat. With a pack, intent → implement → verify stays visible.

We’ll run a **hotfix** for an empty-state crash. Finish this loop before customizing YAML.

---

## Prerequisites

- Node.js 24+ recommended (or 20+ for local dogfood)
- An app repo (or empty folder) you can write to
- Optional: `grok` / `claude` on PATH, or GitHub Copilot in your editor

### Install the CLI

**From npm** (when published):

```bash
npm install -g @structured-vibe-coding/cli
sdd --help
```

**From this monorepo** (maintainers / before publish):

```bash
pnpm install && pnpm build
pnpm --filter @structured-vibe-coding/cli link --global
# or: node packages/cli/dist/index.js …
```

---

## Steps

### 1. Open your app

```bash
cd ~/projects/my-app
```

`sdd` sits **beside** the app. It does not replace React, Python, or your stack.

### 2. Initialize once

```bash
sdd init --here --ai grok
# or: --ai copilot | --ai claude
```

You get `.sdd/`, `memory/`, `changes/`, and agent stubs for **one** host only.

### 3. Start a change

```bash
sdd new "Fix empty list crash" -w hotfix -y --no-agent
sdd status
```

You should see stages like: `intent` → `implement` → `local_verify`.

### 4. Fill the current stage

Edit `changes/<id>/intent.md` with a real problem and fix. Empty templates block `next`.

Or launch the agent:

```bash
sdd agent
# ask it to fill intent.md only for this change
```

### 5. Advance

```bash
sdd next --no-agent   # intent → implement
# code the fix (you or agent)
sdd next --no-agent   # implement → local_verify
```

### 6. Verify and complete

```bash
# optional notes in local-test-results.md
sdd complete --no-agent
```

The pack stays under `changes/<id>/` with `status: completed` (archive is opt-in).

---

## You’re done when

- [x] `.sdd/config.yaml` exists  
- [x] One change pack with a real intent  
- [x] The change is completed (or on the last stage after `complete`)  
- [x] You know `status` / `next` / `complete`  

---

## Next steps

| Goal | Page |
|------|------|
| Wire Grok, Copilot, or Claude | [Agents guide](/guides/agents) |
| Improve specs without advancing | [Refine](/guides/refine) |
| Everyday commands | [Everyday loop](/guides/everyday-loop) |
| Design intent | [Why sdd](/concepts/why-sdd) |

::: warning Stuck on next?
Empty templates fail content checks. Write real sentences in required `.md` files, or `sdd skip <stage> -r "reason"` when the stage is optional.
:::
