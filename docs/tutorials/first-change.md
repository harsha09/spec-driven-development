# Tutorial: your first change

> **You need:** Node.js 20+ (24 recommended) and about **10 minutes**.  
> You’ll install `sdd`, create a small hotfix pack, write a few sentences, advance stages, and complete.

::: tip One path only
This page is a single happy path. Variants live in [everyday loop](/guides/everyday-loop).
:::

## What you’ll get

`sdd` is a **process coach** in your terminal. It keeps a folder of markdown for *this* piece of work (a “change pack”). You and your AI write the content; `sdd` moves you through stages.

```text
your-app/
  .sdd/                 ← process config
  memory/               ← optional project notes
  changes/
    2026-…-fix-…/
      meta.yaml         ← stage + status
      intent.md         ← you fill this first
```

---

## 1. Install the CLI (pick one)

### A — Quickest (no global install)

From any folder, once packages are on npm:

```bash
npx @structured-vibe-coding/cli --help
# later commands: npx @structured-vibe-coding/cli init --here --ai copilot
```

Or install globally:

```bash
npm install -g @structured-vibe-coding/cli
sdd --help
```

### B — Build from this monorepo (if npm package isn’t available yet)

```bash
git clone https://github.com/harsha09/spec-driven-development.git
cd spec-driven-development
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install && pnpm build
pnpm --filter @structured-vibe-coding/cli link --global
sdd --help
```

If `sdd` is “not found”, use path B again or call:

```bash
node /path/to/spec-driven-development/packages/cli/dist/index.js --help
```

---

## 2. Open an app folder

```bash
cd ~/projects/my-app    # any project, or mkdir demo-app && cd demo-app
```

`sdd` lives **next to** your code. It does not replace React, Python, etc.

---

## 3. Pick your AI (required — one host)

| You have… | Init command |
|-----------|----------------|
| **GitHub Copilot** in VS Code / Cursor | `sdd init --here --ai copilot` |
| **Grok Build** CLI | `sdd init --here --ai grok` |
| **Claude Code** CLI | `sdd init --here --ai claude` |

```bash
sdd init --here --ai copilot
sdd doctor
```

`sdd doctor` should show green checks for init (and AI host if you picked one).

**Expected folders** after init:

```text
.sdd/
memory/
changes/
# plus, depending on --ai:
# .github/agents/   or  .grok/rules/  or  .claude/agents/
```

---

## 4. Start a change

```bash
sdd new "Fix empty list crash" -w hotfix -y
```

| Flag | Meaning |
|------|---------|
| `-w hotfix` | Short 3-stage path (good first loop) |
| `-y` | Accept workflow without an extra confirm prompt |

The CLI prints **Next steps** and a file path. Copy that path. (It may also launch your AI agent — you can still edit `intent.md` yourself.)

**Example status shape:**

```text
Stage:    intent
[●] intent — Intent
[ ] implement — Implement
[ ] local_verify — Local smoke
```

---

## 5. Fill the first file (paste this)

Open the file under `changes/<id>/` named **`intent.md`** (hotfix) and replace everything with:

```markdown
# Intent

Empty expenses list crashes the page with a null reference.

Fix: show an empty state when there are zero rows instead of throwing.

Success: open expenses with no data — no error, empty state UI visible.
```

That is enough “real content” for `sdd next` to accept the stage.

::: tip
If you prefer AI to draft it: run `sdd agent` (without `--no-agent` on a later `new`) and say: “Fill intent.md only with a short problem, fix, and success.”
:::

---

## 6. Advance, implement, finish

```bash
sdd next
# Now stage is implement — fix the bug in your app (or ask your AI to)
sdd next
# optional: write a line in local-test-results.md
sdd complete
```

**You’re done when** `sdd status` shows no active change (or the pack’s `meta.yaml` has `status: completed`).

---

## If something fails

| Problem | What to do |
|---------|------------|
| `sdd: command not found` | Re-run install, or use `npx` / full path to `packages/cli/dist/index.js` |
| `next` says artifact incomplete | Open the file in the error; paste the sample intent above |
| Wrong AI files | `sdd agents install --ai copilot --force` (or grok / claude) |
| Unsure about setup | `sdd doctor` |

---

## Next steps

| Goal | Page |
|------|------|
| Run the loop with the agent every time | [Everyday loop](/guides/everyday-loop) |
| Wire Copilot / Grok / Claude properly | [Agents](/guides/agents) |
| Improve specs mid-change | [Refine](/guides/refine) |
| Why this tool exists | [Why sdd](/concepts/why-sdd) |
