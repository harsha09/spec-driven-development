---
title: Spec-Driven Development CLI tutorial (10 minutes)
description: Install sdd, run one simulated hotfix with --no-agent, and finish when sdd status --change shows Status completed.
---

# Spec-Driven Development CLI: start in 10 minutes

You install `sdd`, start one simulated change, write a short note in the project, advance the stages, and finish. The success check is `sdd status --change <id>` printing `Status: completed`.

| | |
|--|--|
| **Time** | About 10 minutes |
| **You need** | CLI 0.24.0: Node.js 24+ and a folder for an app (or an empty folder). Next release: Node 20–23 works but isn't recommended; Node 24 is recommended. |
| **You will do** | `setup` → `new` → write `intent.md` → `next` → `next` → write a result note → `verify` → `complete` |
| **Install** | [`@structured-vibe-coding/cli`](https://www.npmjs.com/package/@structured-vibe-coding/cli) |
| **Checked with** | CLI **0.24.0** on Node.js **24.22.2**, source `9e96194ee002d434cb9f19f1e7109fad57343fc5` |

This tutorial uses `--no-agent` the whole way, so no AI window opens. One path only: the commands below. `sdd go`, other hosts, and a build from source can wait.

The change is simulated. The folder has no application. The loop leaves every product file untouched, and the verify step records NOT RUN. The note says that in plain sentences.

The check below used a new empty folder. It was not a git repository, and nothing was committed.

---

## Step 1 — Check Node and install

```bash
node --version
```

Install once. Use the current release:

```bash
npm install -g @structured-vibe-coding/cli
```

Or, on its own, the release this page was checked against:

```bash
npm install -g @structured-vibe-coding/cli@0.24.0
```

The first command is also how you upgrade. Then:

```bash
sdd --version
npm view @structured-vibe-coding/cli version
```

During the check, `sdd --version` and `npm view` both printed `0.24.0`. A later release can make `npm view` print a different version. The snippets below were captured from CLI 0.24.0. If a line on your machine differs, trust `sdd --version` and `sdd <command> --help`.

**CLI 0.24.0, checked here.** `engines.node` is `>=24`. `sdd doctor` fails the Node line when the major is below 24. The detail is `v<version> (24+ required)`, so v20.19.5 prints `✗ Node.js  v20.19.5 (24+ required)`. This page's doctor run used v24.22.2, and that line passed. Replace this paragraph when a released CLI changes the check.

Next release, not in CLI 0.24.0: Node 20–23 works but isn't recommended; Node 24 is recommended. Doctor warns for a major from 20 through 23 and does not fail when the other checks pass, fails below Node 20, and passes on Node 24 and newer. engines.node becomes `>=20`. CI runs the test suite on Node 20 and Node 24. This is not long-term support for Node 20.

If `sdd` is not on your PATH, use `npx @structured-vibe-coding/cli` wherever this page says `sdd`.

---

## Step 2 — Open a folder

```bash
mkdir demo-first-change
cd demo-first-change
# or: cd ~/projects/my-app
```

`sdd` sits next to your code. The check used a new empty folder. In an app folder, leave the application code unchanged.

---

## Step 3 — One-time setup, no AI host

```bash
sdd setup --yes --no-agent
```

Checked output:

```text
Ready.
Workflow: feature.
planner: intent, clarify_intent, brainstorm
architect: design, clarify_design
builder: tasks, clarify_tasks, implement, local_verify
Next: sdd go "what you want to build"
```

Exit code 0. The folder now has `.sdd/`, `memory/`, `changes/`, and `domains/`. The three role files are `.sdd/roles/planner.md`, `architect.md`, and `builder.md`.

Setup maps those roles onto the **feature** workflow. That is why the message says `Workflow: feature.` This tutorial's change uses **hotfix**, which you choose in the next step. The suggested `sdd go` line is the setup hint. Stay with `sdd new` for this page.

`.sdd/.gitignore` lists `handoff.md`. `changes/.gitignore` lists `.active`.

Then:

```bash
sdd doctor
```

After setup, the v24.22.2 check printed this. The first line is `sdd doctor ·` plus the absolute folder path. The Node patch version is the runtime you have.

```text
sdd doctor · /tmp/sdd-first-change-QpyZEN

  ✓ Node.js  v24.22.2 (24+ required)
  ✓ SDD init  .sdd/config.yaml found
  i AI host  none (no-agent setup; optional: sdd agents install --ai copilot)
  ✓ Active change  none — run: sdd new "My first change"

✔ Looks good. Try: sdd status  or  sdd new "…"
```

Exit code 0. The AI host line is informational. `--no-agent` setup leaves the host empty on purpose.

In an empty folder, `sdd doctor` before setup exits 1 because SDD init is missing. Run setup, then doctor.

### Two names you may see later

| Name | On this tutorial |
|------|------------------|
| **AI host** | Copilot, Grok, Claude, Ollama, or Kilo. Add one later with `sdd agents install --ai …`. |
| **`SDD_ROLE_MODEL`** | An optional environment command a role can use to draft a stage note. Setup does not set it. |

---

## Step 4 — Start a simulated hotfix

```bash
sdd new "Simulated empty-list note" -w hotfix -y --no-agent
```

| Flag | What it does |
|------|----------------|
| `-w hotfix` | Workflow with three stages: intent, implement, local smoke |
| `-y` | Accept that workflow without a prompt |
| `--no-agent` | Do not launch an AI host |

Those flags are on `sdd new --help`.

The id starts with the UTC date (`YYYY-MM-DD`), then a slug of the title. The check on 2026-11-08 created `2026-11-08-simulated-empty-list-note`. Use the id your command prints.

Checked output:

```text
✔ Created change 2026-11-08-simulated-empty-list-note
Workflow: hotfix
Stage:    intent
Path:     changes/2026-11-08-simulated-empty-list-note

Change: Simulated empty-list note
ID:     2026-11-08-simulated-empty-list-note
Status: in_progress
Workflow: hotfix
Path: changes/2026-11-08-simulated-empty-list-note

Stages:
  [●] intent — Intent
  [ ] implement — Implement
  [ ] local_verify — Local smoke

Next steps:
  1. Open changes/2026-11-08-simulated-empty-list-note/intent.md
  2. Replace the template with real sentences (what’s wrong, what you’ll do, how you’ll know it worked)
  3. Run sdd next  (or sdd agent to draft with AI)

Example intent/feature body:
  Empty list crashes the expenses page. Show an empty state instead of throwing.
  Success: open expenses with zero rows — no error, empty state visible.

ℹ Handoff: .sdd/handoff.md
ℹ No AI host configured (no-agent setup) — nothing launched. Add one: sdd agents install --ai copilot|claude|grok|ollama|kilo
```

Exit code 0. The example sentences are a hint from the CLI. The note you write in the next step says this change is simulated.

`sdd status` reprints the same three stages, with **intent** marked `[●]`. It also prints phase times in the machine's local clock. It does not launch a host, and it does not rewrite the handoff.

`.sdd/handoff.md` is there for a later agent. On this stage the handoff says the current stage is intent, and the stage goal is "One short note on what is broken and the fix". Read `intent.md` for what this folder records.

---

## Step 5 — Replace intent.md

Open `changes/<your-id>/intent.md` and replace the template with:

```markdown
# Intent

This is a simulated learning note, not a fix in an application.

The walkthrough pretends an empty list would throw. No product code is changed in this folder.

Success for this tutorial: sdd status --change this id shows Status: completed. No test suite is expected to pass.
```

That text passed `sdd next` on the check. An empty template does not.

The template puts one `-` on its own line under Problem, Proposed change, Out of scope, and Local success check. If those `-` lines are still there, `sdd next --no-agent` exits 1:

```text
 ERROR  Required artifact still incomplete (looks like empty template/stub): intent.md

Open that file and replace the template with a few real sentences, for example:
  - What is broken or missing?
  - What will you change?
  - How will you know it worked?

Then run: sdd next
Optional stages only: sdd skip <stage> -r "not needed" (stage intent)
```

Intent is not an optional stage. Replace the file, then run `sdd next` again.

---

## Step 6 — Move to implement, and leave the code alone

```bash
sdd next --no-agent
```

Checked shape:

```text
 WARN  Soft gate checklist not signed off on "intent" (proceeding allowed).

✔ intent → implement

Stages:
  [✓] intent — Intent
  [●] implement — Implement
  [ ] local_verify — Local smoke

ℹ Handoff: .sdd/handoff.md
ℹ No AI host configured (no-agent setup) — nothing launched. Add one: sdd agents install --ai copilot|claude|grok|ollama|kilo
```

Exit code 0. The command also reprints the change id and title. The soft-gate warning is normal here: the checklist is unsigned, and a soft gate still lets you move.

The handoff stage goal is now "Make the minimal code change". On a real app you would change the code now. This folder has no application. Leave it unchanged.

---

## Step 7 — Record the smoke result, then run verify

```bash
sdd next --no-agent
```

Checked shape:

```text
✔ implement → local_verify
ℹ Artifacts: local-test-results.md

Stages:
  [✓] intent — Intent
  [✓] implement — Implement
  [●] local_verify — Local smoke
```

Exit code 0. The same handoff lines follow. The stage goal is now "Quick local check that the fix works". That sentence is the local_verify summary. This folder still has no product change.

`changes/<your-id>/local-test-results.md` is created from the template, including a `PASS / FAIL` placeholder. Replace that file with an honest note before you verify:

```markdown
# Local test results

Simulated learning change. No application code was edited in this folder.

No test command was run. Record the result as NOT RUN. That is not a pass.
```

Then run ordinary verify. This command does not pass `--no-run`:

```bash
sdd verify --no-agent
```

Checked output:

```text
ℹ Local verify for stage: local_verify
Checklist:
  - [ ] Smoke-checked locally
ℹ Results: changes/2026-11-08-simulated-empty-list-note/local-test-results.md

 WARN  Verify NOT RUN — no verify commands configured for stage "local_verify". Nothing was verified.

Add verify.commands to this stage in .sdd/workflows/<workflow>.yaml, or complete the checklist by hand.

ℹ Handoff: .sdd/handoff.md
ℹ No AI host configured (no-agent setup) — nothing launched. Add one: sdd agents install --ai copilot|claude|grok|ollama|kilo
```

Exit code 1. Hotfix ships with `verify.commands: []` in `.sdd/workflows/hotfix.yaml`, so no command runs. **NOT RUN** means nothing was verified. It is not a pass. `changes/<id>/meta.yaml` records `verify_results.local_verify.status: not_run` and `ok: false`.

The handwritten note stayed as written, because it had replaced the template. If you leave the template in place, `sdd verify` replaces it with a generated report whose overall line is also `NOT RUN — no verify commands configured for stage "local_verify"`.

`--no-run` is a different flag. `sdd verify --help` describes it as writing the checklist without running commands. On this hotfix the command list is already empty, so `sdd verify --no-run --no-agent` prints the same "no verify commands configured" warning and also exits 1. When a stage does list commands, `--no-run` skips them and the warning says `commands not run (--no-run)`. A separate check with a command of `touch ran.flag` left that file absent under `--no-run`, then created it when verify ran for real and printed `Verify PASS`. Do not read either NOT RUN line as a passed test.

Another `sdd next --no-agent` from here exits 0 and says there is nothing further:

```text
 WARN  Soft gate checklist not signed off on "local_verify" (proceeding allowed).

 WARN  No further stages. Run sdd complete when ready.

ℹ Already on the last stage (or no next stage).
```

---

## Step 8 — Finish, and check the status

```bash
sdd complete --no-agent
```

Checked output:

```text
✔ Completed 2026-11-08-simulated-empty-list-note

ℹ Handoff: .sdd/handoff.md
ℹ No AI host configured (no-agent setup) — nothing launched. Add one: sdd agents install --ai copilot|claude|grok|ollama|kilo
```

Exit code 0. Complete is allowed on this hotfix because the gate is soft and no verify command is required. The completed change still has `verify_results` of `not_run`.

### Success check

```bash
sdd status --change 2026-11-08-simulated-empty-list-note
```

Use your id. Checked result, exit code 0:

```text
Change: Simulated empty-list note
ID:     2026-11-08-simulated-empty-list-note
Status: completed
Workflow: hotfix
Path: changes/2026-11-08-simulated-empty-list-note

Stages:
  [✓] intent — Intent
  [✓] implement — Implement
  [●] local_verify — Local smoke
```

`Status: completed` is the success line. `[●]` stays on `local_verify` because that is the stage pointer. Phase times follow, in the local clock, and they are not part of the check.

`sdd status` with no `--change` then exits 1:

```text
 ERROR  No active change. Pass --change <id> or run sdd new.
```

That line means there is no in-progress change. It is not the success check.

---

## If something goes wrong

| What you see | What to do |
|--------------|------------|
| `sdd: command not found` | Install again, or use `npx @structured-vibe-coding/cli` |
| `✗ Node.js … (24+ required)` from `sdd doctor` | CLI 0.24.0 failed that line. This page was checked on v24.22.2 |
| `next` says `intent.md` is incomplete | Paste the sample intent above |
| Doctor before setup exits 1 on `SDD init` | Run `sdd setup --yes --no-agent`, then `sdd doctor` |
| `Verify NOT RUN` and exit 1 | Expected on this hotfix. The result note should say NOT RUN |
| Want an AI host after this tutorial | `sdd agents install --ai grok` (or `copilot`, `claude`, `ollama`, `kilo`). `--force` overwrites that host's stubs |

---

## What you just did

| Command | What happened |
|---------|----------------|
| `sdd setup --yes --no-agent` | Created `.sdd/`, `memory/`, `changes/`, and `domains/` without an AI host |
| `sdd new "Simulated empty-list note" -w hotfix -y --no-agent` | Started the simulated change on intent |
| `sdd status --change <id>` | Showed that change, including `Status: completed` at the end |
| `sdd next --no-agent` | Moved one stage |
| `sdd verify --no-agent` | Ran verify. Hotfix has no commands, so the result was NOT RUN |
| `sdd complete --no-agent` | Marked the change completed |

| Word | Meaning |
|------|---------|
| Change pack | The folder `changes/<id>/` |
| Stage | intent, implement, or local smoke |
| Workflow | The stage list. Here: `hotfix` |
| Memory | Product notes under `memory/` that outlive one change |
| AI host | Copilot, Grok, Claude, Ollama, or Kilo |
| Role | A duty file under `.sdd/roles/` |
| Handoff | `.sdd/handoff.md`, rewritten by stage commands and listed in `.sdd/.gitignore` |

---

## What next?

| I want to… | Go here |
|------------|---------|
| Use the same commands on a real change | [Everyday loop](../guides/everyday-loop) |
| Turn an AI host on | [AI agents setup](../guides/agents) |
| Ship a real feature | [Simple feature](../guides/simple-feature) |
| Start a product from one sentence | [Greenfield](../guides/greenfield) |
| Understand roles and duties | [Roles and duties](../guides/roles) |
| Look up a flag | [CLI reference](../reference/cli) |
| Load the repository skill pack | [Skill pack](../guides/skills) |

The skill pack is `skills/` in a checkout of this repository. npm, `sdd init`, and `sdd agents install` do not install it.
