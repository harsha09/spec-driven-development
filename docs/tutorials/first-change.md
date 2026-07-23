# Tutorial: your first change

> **Now what:** In ~10 minutes you will init `sdd`, start a hotfix pack, advance stages, and complete — on your laptop.

::: tip Learning path
This is a **tutorial** (Diátaxis): one happy path only. Variants live in [guides](/guides/everyday-loop).
:::

## PREP

**Point:** `sdd` owns process; you + your AI agent own content.

**Reason:** Without a pack, agents invent scope every chat. With a pack, intent → implement → verify is visible.

**Example:** Hotfix empty-state crash through `hotfix` workflow.

**Point:** Finish one loop before customizing YAML.

---

## What / When / How

| | |
|--|--|
| **What** | `sdd` CLI + one AI host (Grok, Copilot, or Claude) |
| **When** | Start of a small, real fix |
| **How** | Commands below, in order |

---

## Prerequisites

- Node.js 24+ recommended (or 20+ for local dogfood)
- An app repo (or empty folder) you can write to
- Optional: `grok` / `claude` on PATH, or GitHub Copilot in your editor

### Install CLI

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

`sdd` sits **beside** the app. It does not replace React/Python/etc.

### 2. Initialize once

```bash
sdd init --here --ai grok
# or: --ai copilot | --ai claude
```

**What you get:** `.sdd/`, `memory/`, `changes/`, plus agent stubs for **one** host only.

### 3. Start a change

```bash
sdd new "Fix empty list crash" -w hotfix -y --no-agent
sdd status
```

You should see stages like: `intent` → `implement` → `local_verify`.

### 4. Fill the current stage (substantive text)

Edit `changes/<id>/intent.md` with real problem + fix (empty templates block `next`).

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

Pack stays under `changes/<id>/` with `status: completed` (archive is opt-in).

---

## Expected outcome

- [x] `.sdd/config.yaml` exists  
- [x] One change pack with filled intent  
- [x] Status shows completed (or last stage done + `complete`)  
- [x] You know `status` / `next` / `complete`  

---

## Now what

| Next goal | Page |
|-----------|------|
| Wire Grok/Copilot/Claude properly | [Agents guide](/guides/agents) |
| Improve specs without advancing | [Refine](/guides/refine) |
| Everyday commands | [Everyday loop](/guides/everyday-loop) |
| Why this design | [Why sdd](/concepts/why-sdd) |

::: warning Stuck on next?
Empty templates fail substantive checks. Write real sentences in required `.md` files, or `sdd skip <stage> -r "reason"` when optional.
:::
