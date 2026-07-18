# Structured Vibe Coding (`sdd`)

Flexible, **local-first Spec-Driven Development** for software engineers.

Use `sdd` to add just enough structure when building apps—without locking your team into a rigid pipeline. Workflows are plain **YAML**, work is **spec-first**, verification is **local**, and every change can pick (or override) its own process—**including per PR**.

| | |
|---|---|
| **Who** | Solo engineers and small teams (scales to larger teams via YAML policy) |
| **Where** | Your laptop only — no cloud account required |
| **How** | CLI + VS Code/Cursor extension on the same core |

---

## Table of contents

1. [Install](#install)
2. [How to use it](#how-to-use-it)
3. [Command reference](#command-reference)
4. [Project layout](#project-layout)
5. [How to customize](#how-to-customize)
6. [Three workflow customization examples](#three-workflow-customization-examples)
7. [Per-PR customization](#per-pr-customization)
8. [Default workflow packs](#default-workflow-packs)
9. [VS Code / Cursor extension](#vs-code--cursor-extension)
10. [npm packages](#npm-packages)
11. [Develop this repo](#develop-this-repo)
12. [License](#license)

---

## Install

### Requirements

- **Node.js 24+** (current active CI/runtime target)
- **pnpm** (for building from source) — or enable via Corepack: `corepack enable`

### Option A — Install CLI from npm (recommended)

```bash
npm install -g @structured-vibe-coding/cli
# or use without global install:
npx @structured-vibe-coding/cli --help
```

Binary name: **`sdd`**

```bash
sdd --help
sdd init
```

Core library (for tooling / custom integrations):

```bash
npm install @structured-vibe-coding/core
```

> First publish: create an npm account, set `NPM_TOKEN`, then run `pnpm publish:npm` from this repo (see [npm packages](#npm-packages)). Until packages are on the registry, use Option B.

### Option B — Build from this repository

Clone and build the monorepo, then link the CLI globally:

```bash
git clone https://github.com/structured-vibe-coding/spec-driven-development.git
cd spec-driven-development

corepack enable
corepack prepare pnpm@9.15.0 --activate

pnpm install
pnpm build

pnpm --filter @structured-vibe-coding/cli link --global
sdd --help
```

Without global link:

```bash
node packages/cli/dist/index.js init
# or
pnpm --filter @structured-vibe-coding/cli exec node ./dist/index.js init
```

### Option C — VS Code / Cursor extension

```bash
pnpm install && pnpm build
pnpm package:vscode
```

Then **Install from VSIX…** in VS Code or Cursor (see [VS Code / Cursor extension](#vs-code--cursor-extension)).

### Uninstall / unlink

```bash
npm uninstall -g @structured-vibe-coding/cli
# or if linked from source:
pnpm --filter @structured-vibe-coding/cli unlink --global
```
---

## How to use it

Think of `sdd` as a **local process coach** for one unit of work (usually one PR):

```text
init project → start a change → fill specs → next stage → …
→ implement with your editor/agent → verify locally → complete (archive)
```

### Step 0 — Open the app you are building

`sdd` does **not** replace your stack (React, Python, etc.). It lives **beside** the app as dev-time structure.

```bash
cd ~/projects/my-app   # existing app
# or
mkdir my-app && cd my-app && git init
```

### Step 1 — Initialize SDD in the project

```bash
sdd init
```

This creates:

| Path | Purpose |
|------|---------|
| `.sdd/config.yaml` | Project policy and paths |
| `.sdd/workflows/` | Workflow packs (YAML) |
| `.sdd/templates/` | Markdown templates for stage artifacts |
| `memory/` | Stable product / architecture / conventions |
| `changes/` | Active work (one folder per change ≈ PR) |
| `archive/` | Completed changes |
| `domains/` | Optional long-lived domain notes |

Re-copy defaults later with:

```bash
sdd init --force
```

### Step 2 — (Optional) Fill project memory

Edit the stable context your team always wants agents and humans to see:

```text
memory/product.md
memory/architecture.md
memory/conventions.md
```

Keep these short. They apply across all changes.

### Step 3 — Start a change (spec-first)

```bash
sdd new "Add expense CSV export"
```

What happens:

1. You give a **title** (what you want to build or fix).
2. `sdd` **recommends** a workflow (`hotfix`, `patch`, `feature`, …) from the title and keywords.
3. You confirm or pick another pack.
4. A folder is created under `changes/<date>-<slug>/` with:
   - `meta.yaml` — workflow, stage, flags, overrides
   - First-stage artifacts (e.g. `intent.md` or `feature.md`)

**Useful variants:**

```bash
# Accept recommendation without interactive confirm
sdd new "Fix typo in README" -y

# Force a specific workflow
sdd new "Payments v2" --workflow enterprise-feature
sdd new "Payments v2" -w feature

# Pass flags used by skip rules (example: skip DB design)
sdd new "UI polish" -w enterprise-feature -f no_db=true
```

### Step 4 — Work the current stage

1. Open `sdd status` to see where you are.
2. Edit the markdown artifacts for that stage (intent, design, stories, …).
3. When the stage is done, advance:

```bash
sdd status
sdd next
```

`sdd next` will:

- Check **required artifacts** exist
- Respect **gates** (soft warnings or hard blocks)
- Create the **next stage’s files** from templates
- Move `meta.yaml` to the next stage

If a hard gate blocks you (e.g. ARB):

```bash
sdd gate approve -n "Approved with condition: reuse existing outbox"
sdd next
```

### Step 5 — Implement (with or without an AI agent)

When you reach an `implement` stage:

```bash
# Copy a handoff prompt into Cursor / Claude Code / etc.
sdd agent
```

Or:

```bash
sdd agent | pbcopy   # macOS
```

Implement code in the normal way in your app. Artifacts under `changes/…` and `memory/` are the source of truth for intent and constraints.

### Step 6 — Verify locally

```bash
sdd verify
```

This stage is **local development only**:

- Runs any commands defined on the stage (if configured)
- Writes / updates local results and evidence under the change folder
- Prints checklists (happy path, edge cases, …)

Mark the gate when you are satisfied:

```bash
sdd gate approve -n "Happy path + one edge case checked on laptop"
```

Optional: dry checklist only (no shell commands):

```bash
sdd verify --no-run
```

### Step 7 — Complete and archive

When you are on the **last** stage and ready to close the work:

```bash
sdd complete
```

The change pack is moved to `archive/<id>/` for history and onboarding. Start the next piece of work with another `sdd new`.

### Everyday loop (short)

```bash
sdd new "…"          # start
# edit artifacts
sdd next             # repeat until implement
sdd agent            # optional
# code…
sdd verify
sdd gate approve     # if needed
sdd complete
```

### Multiple changes / PRs

```bash
sdd status --list              # list open changes
sdd checkout 2026-07-18-my-id  # set active change
sdd status
```

### Escape hatches

```bash
# Skip a stage for THIS change only (needs a reason by default)
sdd skip design -r "trivial UI copy"

# Switch workflow mid-flight (this change only)
sdd use feature -r "scope grew past a patch"

# Bypass gate/artifact checks (use sparingly)
sdd next --force
```

---

## Command reference

| Command | What it does | When to use it |
|---------|----------------|----------------|
| `sdd init` | Scaffolds `.sdd/`, memory, workflows, changes, archive | Once per app repo |
| `sdd init --force` | Re-copies default workflows/templates | After upgrading the tool |
| `sdd new "title"` | Creates a change pack; recommends workflow | Start of a PR / task |
| `sdd new … -w <pack>` | Same, with explicit workflow | You already know the process |
| `sdd new … -y` | Accept recommended workflow | Scripting / fast path |
| `sdd new … -f key=value` | Sets flags on the change (e.g. `no_db=true`) | Conditional stages |
| `sdd status` | Shows stages, current position, skips, gates | Anytime |
| `sdd status --list` | Lists open changes | Multiple concurrent PRs |
| `sdd next` | Advances one stage | Stage finished |
| `sdd next --force` | Advances even if gate/artifacts fail checks | Emergency / WIP |
| `sdd skip <stage> -r "…"` | Skips a stage for this change | Stage not applicable |
| `sdd use <workflow>` | Switches pack for this change | Scope changed |
| `sdd gate approve` | Approves current (or `--stage`) gate | Hard/soft sign-off |
| `sdd gate waive` | Waives a gate with a note | Explicit exception |
| `sdd gate fail` | Marks gate failed | Send work back |
| `sdd verify` | Local verification for current stage | Before complete / after implement |
| `sdd verify --no-run` | Checklist/evidence only, no commands | Manual-only verify |
| `sdd complete` | Marks done and archives the change | Work finished locally |
| `sdd workflows` | Lists packs in `.sdd/workflows/` | Discover / debug |
| `sdd agent` | Prints agent handoff for current stage | AI-assisted coding |
| `sdd checkout <id>` | Sets active change | Switch between PRs |
| `sdd help` | Overview | First run |

Get flags for a single command:

```bash
sdd new --help
sdd skip --help
```

---

## Project layout

After `sdd init` and a few changes:

```text
my-app/
├── .sdd/
│   ├── config.yaml           # paths, defaults, per-change policy
│   ├── README.md
│   ├── workflows/            # ← customize process here
│   │   ├── hotfix.yaml
│   │   ├── patch.yaml
│   │   ├── feature.yaml
│   │   ├── enterprise-feature.yaml
│   │   └── spike.yaml
│   └── templates/            # markdown templates for artifacts
├── memory/                   # stable project context
├── changes/                  # active change packs (≈ open PRs)
│   └── 2026-07-18-add-csv-export/
│       ├── meta.yaml
│       ├── feature.md
│       ├── design.md
│       ├── tasks.md
│       └── …
├── archive/                  # completed packs
└── domains/                  # optional long-lived domain specs
```

**Persistence model (simple version):**

- **Change pack** = unit of work for one PR (ephemeral while open, archived when done)
- **Memory** = always-on project context
- **Domain** = optional living docs for important areas (billing, auth, …)

---

## How to customize

Customization has three layers. Use the lightest layer that works.

### 1. Project config — `.sdd/config.yaml`

Controls defaults and how free engineers are **per change**:

```yaml
version: 1
memory_path: memory
changes_path: changes
archive_path: archive
domains_path: domains

# "recommend" = pick pack from title/keywords; or set a fixed pack name
default_workflow: recommend

# Optional allowlist (omit = all workflows in .sdd/workflows/)
# allowed_workflows: [hotfix, patch, feature, enterprise-feature]

per_change:
  allow_skip: true
  allow_gate_override: soft_only   # true | false | soft_only
  allow_custom_stages: true
  require_reason_on_skip: true

persistence:
  default: change_only
  archive_on_complete: true
  domain_sync:
    mode: never                    # never | recommend | require
    anchored_domains: []

policy:
  gates: soft                      # soft | hard  (global lean)
```

### 2. Workflow packs — `.sdd/workflows/*.yaml`

Each file is a **named process**: ordered stages, artifacts, gates, optional local verify commands, recommendation hints.

Minimal shape:

```yaml
name: my-pack
description: What this pack is for
version: 1
recommendation:
  priority: 25
  when:
    keywords: [api, endpoint]
stages:
  - id: intent
    title: Intent
    summary: What and why
    skippable: false
    artifacts:
      - id: intent
        path: intent.md
        template: intent.md
        required: true
    gate:
      type: soft
      checklist:
        - "Intent is clear"
  - id: implement
    title: Implement
    skippable: false
    artifacts: []
    gate:
      type: soft
  - id: local_verify
    title: Local verify
    skippable: true
    artifacts:
      - id: local-test-results
        path: local-test-results.md
        template: local-test-results.md
        required: false
    gate:
      type: soft
      checklist:
        - "Checked on this machine"
    verify:
      commands: []                 # optional: { name, run, required }
      evidence_dir: evidence/local
on_complete:
  archive: true
  domain_sync: never
```

**Stage fields you will use most:**

| Field | Meaning |
|-------|---------|
| `id` | Stable stage name (`sdd skip`, gates, status) |
| `artifacts` | Files created when you enter the stage |
| `template` | File under `.sdd/templates/` |
| `required` | `sdd next` fails if missing |
| `gate.type` | `none` \| `soft` \| `hard` |
| `gate.overridable` | Can policy/per-change soften a hard gate? |
| `skippable` | Can `sdd skip` remove it for this PR? |
| `skip_when.flags` | Auto-skip if change has that flag (`-f no_db=true`) |
| `verify.commands` | Local shell commands for `sdd verify` |
| `agent_context.instructions` | Extra text for `sdd agent` |

### 3. Templates — `.sdd/templates/*.md`

Markdown skeletons with placeholders:

- `{{title}}`, `{{id}}`, `{{workflow}}`, `{{stage}}`, `{{stage_title}}`, `{{date}}`

Edit templates so ARB packets, stories, or test plans match **your** team’s language.

### 4. Per change — `changes/<id>/meta.yaml`

Written by the tool; you can also adjust via CLI (`skip`, `use`, flags). Holds:

- `workflow` — pack for this PR  
- `stage` — current stage  
- `flags` — e.g. `no_db: true`  
- `overrides.skip_stages` — skipped for this PR  
- `gates` — approve / waive / fail records  

---

## Three workflow customization examples

These are realistic customizations you can copy into `.sdd/workflows/`.

---

### Example 1 — Mobile app: “design review → implement → device check”

**Goal:** Small product team building a mobile app wants a design review before code, and **must** smoke-test on a local simulator/device before done.

**Create** `.sdd/workflows/mobile-feature.yaml`:

```yaml
name: mobile-feature
description: Feature with design review and local device smoke
version: 1
recommendation:
  priority: 40
  when:
    keywords: [screen, ui, mobile, ios, android]
stages:
  - id: intent
    title: Feature intent
    summary: User problem, screen scope, non-goals
    skippable: false
    artifacts:
      - id: feature
        path: feature.md
        template: feature.md
        required: true
    gate:
      type: soft
      checklist:
        - "Scope fits one PR"

  - id: design_review
    title: Design review
    summary: UX notes / Figma link / edge cases for UI
    skippable: false
    artifacts:
      - id: design
        path: design.md
        template: design.md
        required: true
    gate:
      type: hard
      overridable: false
      checklist:
        - "Design reviewed (or explicit waive note)"

  - id: implement
    title: Implement
    summary: Build the UI and wiring
    skippable: false
    artifacts: []
    gate:
      type: soft
    agent_context:
      instructions: |
        Follow design.md. Prefer existing components.
        Keep changes limited to the scoped screens.

  - id: local_verify
    title: Local device smoke
    summary: Run on simulator or device on this machine
    skippable: false
    artifacts:
      - id: local-test-plan
        path: local-test-plan.md
        template: local-test-plan.md
        required: true
      - id: local-test-results
        path: local-test-results.md
        template: local-test-results.md
        required: true
    gate:
      type: hard
      overridable: true
      checklist:
        - "Happy path on local simulator/device"
        - "Dark mode / small phone checked or waived"
    verify:
      commands:
        # Adjust to your stack; empty is fine if fully manual
        # - name: unit
        #   run: "npm test"
        #   required: false
      evidence_dir: evidence/local

on_complete:
  archive: true
  domain_sync: never
```

**How to use it:**

```bash
sdd new "Add profile avatar crop screen" -w mobile-feature
# fill feature.md → sdd next
# fill design.md → sdd gate approve → sdd next
# implement → sdd next
sdd verify
sdd gate approve -n "iOS sim OK"
sdd complete
```

**What you customized:** stage order, a **hard** design gate, and a mandatory **local** device verify—without changing the tool’s code.

---

### Example 2 — Backend API: “contract → implement → local curl suite”

**Goal:** API team wants OpenAPI/contract notes first, then implementation, then local HTTP checks.

**Create** `.sdd/workflows/api-endpoint.yaml`:

```yaml
name: api-endpoint
description: Add or change an API endpoint with contract + local curl checks
version: 1
recommendation:
  priority: 35
  when:
    keywords: [api, endpoint, rest, graphql, route]
stages:
  - id: intent
    title: Intent
    summary: Why this endpoint exists and who calls it
    skippable: false
    artifacts:
      - id: intent
        path: intent.md
        template: intent.md
        required: true
    gate:
      type: soft

  - id: contract
    title: API contract
    summary: Request/response shapes, errors, auth
    skippable: false
    artifacts:
      - id: design
        path: contract.md
        template: design.md    # reuse design template or add contract.md template
        required: true
    gate:
      type: soft
      checklist:
        - "Status codes and error bodies defined"
        - "Auth requirements explicit"

  - id: implement
    title: Implement
    skippable: false
    artifacts: []
    gate:
      type: soft
    agent_context:
      instructions: |
        Implement exactly the contract in contract.md.
        Add or update local tests if the repo has them.

  - id: local_verify
    title: Local HTTP verify
    summary: Hit the endpoint on localhost
    skippable: false
    artifacts:
      - id: local-test-results
        path: local-test-results.md
        template: local-test-results.md
        required: true
    gate:
      type: hard
      checklist:
        - "Success path verified on localhost"
        - "At least one error path verified"
    verify:
      commands:
        - name: unit
          run: "npm test -- --runInBand"
          required: false
        # Example only — point at your real smoke script:
        # - name: smoke
        #   run: "npm run smoke:local"
        #   required: false
      evidence_dir: evidence/local

on_complete:
  archive: true
  domain_sync: never
```

**Optional:** add `.sdd/templates/contract.md` with sections for method, path, body, errors—then set `template: contract.md` on the contract artifact.

**How to use it:**

```bash
sdd new "POST /v1/expenses export job" -w api-endpoint
sdd next          # after intent
# edit contract.md
sdd next          # implement
sdd agent         # hand off to coding agent
# start API locally, then:
sdd verify
sdd gate approve
sdd complete
```

**What you customized:** a **contract** stage (not generic “design”), plus local verify aimed at HTTP—not a full enterprise ARB chain.

---

### Example 3 — Your enterprise path: ARB → LLD → DB → research → stories → tasks → implement → local test

**Goal:** Match a heavier team process. This pack already ships as `enterprise-feature`; customize it in place or copy to a new name.

**Shipped flow:**

```text
feature → hl_arb → lld → db_design → code_research →
stories → tasks → implement → local_verify
```

**Customize in** `.sdd/workflows/enterprise-feature.yaml` (examples of common edits):

**A) Make DB design auto-skip when not needed** (already supported via flag):

```yaml
  - id: db_design
    title: DB design
    skippable: true
    skip_when:
      flags: [no_db]
    artifacts:
      - id: db-design
        path: db-design.md
        template: db-design.md
        required: true
    gate:
      type: soft
```

Usage:

```bash
sdd new "Checkout retry UX only" -w enterprise-feature -f no_db=true
# db_design shows as skipped
```

**B) Soften ARB for a smaller squad** (edit the gate):

```yaml
  - id: hl_arb
    gate:
      type: soft          # was hard
      overridable: true
      checklist:
        - "Tech lead async review recorded in arb-decision.md"
```

**C) Add a required local test command** after implement:

```yaml
  - id: local_verify
    verify:
      commands:
        - name: unit
          run: "pnpm test"
          required: false
        - name: typecheck
          run: "pnpm typecheck"
          required: false
      evidence_dir: evidence/local
    gate:
      type: hard
      checklist:
        - "Happy path verified locally"
        - "Critical stories covered or waived"
```

**D) Insert a new stage** (e.g. security notes) without rewriting the tool—add a stage object between `lld` and `db_design`:

```yaml
  - id: security_notes
    title: Security notes
    summary: Authz, PII, threat notes for this change
    skippable: true
    artifacts:
      - id: security
        path: security.md
        template: intent.md    # or a dedicated template you add
        required: true
    gate:
      type: soft
      checklist:
        - "Sensitive data paths identified or N/A"
```

**Full day-in-the-life with the enterprise pack:**

```bash
sdd init
sdd new "Checkout payment retry" -w enterprise-feature

# 1) Feature definition
#    edit changes/.../feature.md
sdd next

# 2) High-level design + ARB
#    edit hl-design.md, arb-packet.md, arb-decision.md
sdd gate approve -n "Approved with conditions"
sdd next

# 3) LLD
#    edit lld.md
sdd next

# 4) DB design (or skip)
sdd skip db_design -r "no schema change"
# or: sdd next after editing db-design.md

# 5) Code research → stories → tasks
sdd next   # research
sdd next   # stories
sdd next   # tasks

# 6) Implement
sdd next
sdd agent  # paste into your coding agent
# … write code …

# 7) Local verify
sdd next
sdd verify
sdd gate approve -n "Local happy path OK"
sdd complete
```

**What you customized:** governance (ARB hard gate), optional DB stage, and local verification—encoded as data your team owns in git.

---

## Per-PR customization

Not every PR needs the same process. `sdd` stores the path for **this** change in `changes/<id>/meta.yaml`.

| Need | Command / mechanism |
|------|---------------------|
| Different pack for this PR | `sdd new "…" -w patch` or `sdd use feature -r "…"` |
| Stage does not apply | `sdd skip db_design -r "no schema"` |
| Conditional auto-skip | `sdd new "…" -f no_db=true` (if workflow defines `skip_when`) |
| Sign off a gate only here | `sdd gate approve` / `waive` / `fail` |
| Mid-flight process change | `sdd use enterprise-feature -r "now needs ARB"` |

Team guardrails stay in `.sdd/config.yaml` and stage `skippable` / `overridable` flags so flexibility does not mean chaos.

---

## Default workflow packs

| Pack | Stages (summary) | Best for |
|------|------------------|----------|
| `hotfix` | intent → implement → local_verify | Typos, one-liners |
| `patch` | intent → acceptance → implement → local_verify | Small bugs / scoped tweaks |
| `feature` | intent → design → tasks → implement → local_verify | Normal features |
| `enterprise-feature` | feature → ARB → LLD → DB → research → stories → tasks → implement → local_verify | Heavy / multi-stakeholder work |
| `spike` | intent → research → outcome | Time-boxed exploration |

List what is installed in a repo:

```bash
sdd workflows
```

---

## VS Code / Cursor extension

Uses the **same core** as the CLI (bundled into the VSIX). No separate CLI install required for IDE use.

| Feature | Command palette |
|---------|-----------------|
| Initialize | `SDD: Initialize in Workspace` |
| New change | `SDD: New Change` |
| Stages | `SDD: Next Stage`, `Skip Stage`, `Switch Workflow` |
| Gates | `SDD: Approve Gate`, `Waive Gate` |
| Local verify | `SDD: Local Verify` |
| Agent handoff | `SDD: Copy Agent Handoff` |
| Complete | `SDD: Complete Change` |

**Sidebar:** Activity bar → **Structured Vibe** (changes, stages, artifacts).

```bash
pnpm install && pnpm build
pnpm package:vscode
# → packages/vscode/structured-vibe-sdd-0.1.0.vsix
```

- VS Code: Extensions → **Install from VSIX…**
- `code --install-extension packages/vscode/structured-vibe-sdd-*.vsix`
- `cursor --install-extension packages/vscode/structured-vibe-sdd-*.vsix`

See [`packages/vscode/README.md`](packages/vscode/README.md).

---

## npm packages

| Package | Install |
|---------|---------|
| `@structured-vibe-coding/cli` | `npm i -g @structured-vibe-coding/cli` → binary `sdd` |
| `@structured-vibe-coding/core` | `npm i @structured-vibe-coding/core` |

### Publish (maintainers)

```bash
npm login
pnpm publish:npm:dry   # dry run
pnpm publish:npm       # publish core then cli (local)
```

**GitHub Actions CI/CD** (preferred):

| Pipeline | Trigger | What |
|----------|---------|------|
| **CI** | PR / push to `main` | Build, test, smoke, VSIX artifact |
| **Auto release on push** | Push to `main` (`packages/**`) | **Auto version bump** → npm publish → tag → GitHub Release + VSIX |

1. Secret **`NPM_TOKEN`** (publish + bypass 2FA) — already set if you added it.  
2. **Settings → Actions → General → Workflow permissions → Read and write** (so the bot can push version commits/tags).  
3. Push to `main` (or run **Auto release on push** manually).  
   - Versions bump from **conventional commits** (`feat` → minor, `fix` → patch, `BREAKING` → major).  
   - No manual version edit required.

Full guide: [`docs/ci-cd.md`](docs/ci-cd.md).

---

## Develop this repo

```text
packages/
  core/     @structured-vibe-coding/core   # engine + default workflows
  cli/      @structured-vibe-coding/cli    # `sdd` binary
  vscode/   structured-vibe-sdd     # VS Code / Cursor extension
```

```bash
pnpm install
pnpm build
pnpm test
pnpm package:vscode
```

---

## Design principles (short)

1. **Spec-first** — every change starts with an intent/spec artifact  
2. **Progressive structure** — recommend light workflows for small work  
3. **Local development only** — verify on the engineer’s machine  
4. **Composable workflows** — your process in YAML, not our fixed religion  
5. **Change packs** — PR-scoped work with archive for history  

---

## Roadmap

- [x] Core engine + CLI  
- [x] Default + enterprise workflow packs  
- [x] Per-change workflow / skip / gates  
- [x] IDE extension (VS Code / Cursor) on the same core  
- [x] npm package publish setup (CLI + core)  
- [ ] Marketplace listing for the extension  
- [ ] Richer recommend heuristics  
- [ ] `sdd workflow save-as` to promote one-off packs  

---

## License

MIT
