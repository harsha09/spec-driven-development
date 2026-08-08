# sdd product roadmap

> **Audience:** maintainers and implementers.  
> **Purpose:** preserve *intent* so features are not re-interpreted as “build Spec Kit” or “add random integrations.”  
> **Status:** living document · last updated **2026-08-08** · product ~**v0.16–0.17**  
> **Package:** `@structured-vibe-coding/cli` (binary `sdd`) · engine `@structured-vibe-coding/core`

---

## 1. Product identity (do not lose this)

### What sdd is

**sdd is a focused, local, git-native Spec-Driven Development CLI.**

- **Local** — process state lives in the user’s repo (`.sdd/`, `changes/`, `memory/`), not a cloud process product.
- **Git-native** — short, versioned steps and notes are markdown, reviewable in PRs, survive chat history loss.
- **Agent-agnostic** — works with Copilot, Claude Code, Grok, Ollama (and similar); one agent at setup; any editor.
- **Complexity-aware** — graduated workflow packs (hotfix → patch → feature → spike → greenfield → enterprise-feature), not one waterfall for every change.
- **Structured vibe coding** — AI writes fast; the *reasons* disappear into chat → keep the plan and progress **in git**.

**Core loop (must stay fast and teachable):**

```text
init → new | greenfield | backlog start
     → edit short markdown
     → next / skip / gate
     → verify → complete
```

`--no-agent` must remain first-class for learning without launching an AI window.

### What sdd is not

| Not this | Why |
|----------|-----|
| **GitHub Spec Kit** (or a clone) | Spec Kit is a large ecosystem (presets, multi-agent orchestration, community extensions). sdd is a **practical process coach** with change packs + graduated workflows. We **complement / alternative**, not feature-race. |
| **AWS Kiro** or cloud SDD SaaS | Contradicts local-in-git philosophy. |
| **Jira / full ALM** | Trackers may *seed* a change; they are not the source of truth for stage progress. |
| **Inbound MCP process server** | sdd is an **MCP client** (calls external design-system / AST / API sources). Process stays **CLI** (`new` / `next` / …). Do not reintroduce “Cursor drives `sdd next` via MCP tools” as the model. |
| **Multi-repo process fabric** | One **product boundary** = one sdd root. FE+BE of one product → **one monorepo (or one repo) + one sdd**. Per-repo sdd for FE vs BE **breaks vertical user stories** and consistency. |
| **Required IDE extension** | Optional convenience later; never required. |

### Strategic north star (one sentence)

> Stay the best **local, complexity-aware change-pack process** for any coding agent; deepen **guidance + verify + vertical-slice awareness**; grow via **clarity and demos**, not by becoming Spec Kit.

### Success metrics (product-shaped, not vanity alone)

| Metric | Meaning |
|--------|---------|
| Time to first `complete` | Activation of the 10-minute loop |
| Meaningful packs | Real sentences in artifacts, not empty templates |
| Refine usefulness | Gaps found → artifacts updated before implement |
| Verify usefulness | Acceptance actually checked, not only soft checklist click |
| Vertical slice integrity | One change pack can span FE+BE in one product root |
| Docs / Search | Non-brand queries (e.g. “AI coding decisions in git”, “spec-driven development CLI”) |
| npm / stars | Secondary; registry downloads ≠ active users |

---

## 2. Current foundation (baseline — already built)

Implementers: **extend these**; do not reimplement from scratch.

| Area | What exists | Assessment (early 2026) |
|------|-------------|-------------------------|
| **Code quality** | pnpm monorepo, TypeScript, Zod, Biome, Vitest, core vs CLI split, `pathe`, MCP client, code-context pipeline | Strong for stage (~7.5–8/10). Smell: large `packages/cli/src/commands.ts`. Node `>=24` is aggressive. |
| **Workflows** | hotfix, patch, feature, spike, greenfield, enterprise-feature; soft/hard gates; skip + reason; recommend by keywords; greenfield promote → `memory/` | **Strongest subsystem** (~8/10). |
| **Change packs** | `changes/<id>/` + `meta.yaml`; active change; handoff | Correct philosophy. |
| **Memory** | constitution, conventions, product spine after greenfield, backlog (`sdd backlog list\|start`; `feature` alias) | Durable vs ephemeral split is intentional. |
| **Agents** | Host stubs + role hints; handoff builder | Functional but **thin prompts** (~6/10). |
| **Code context** | TS-focused AST focus → graph → rank → slice + secrets | Good; language breadth limited. |
| **MCP** | Outbound sources in `.sdd/mcp.yaml`; match by stage/workflow/intents; optional handoff auto-fetch | Keep **client-only**. |
| **Adoption** | Docs site, npm package; low community visibility | Maturity vs leaders ~5.5–6.5/10. |

### Document lifetime model (do not invent a second wiki engine)

| Layer | Path | Maintain |
|-------|------|----------|
| Ephemeral | `.sdd/handoff.md`, `active-context.md` | Regenerate; never curate |
| Change-scoped | `changes/<id>/*` | Stop gardening after `complete` |
| Durable | `memory/*` | Thin, promote on complete only |

No roadmap item should turn every generated file into permanent knowledge.

### Product root model (FE + BE)

- **One product** (frontend + backend) → **one sdd root** at monorepo/repo root.  
- Vertical user stories = **one change pack** spanning FE+BE folders.  
- **Not** sdd-per-frontend-repo + sdd-per-backend-repo (slice splits; consistency dies).

---

## 3. Priority labels (use these in issues and PRs)

| Label | Name | Meaning for implementers |
|-------|------|---------------------------|
| **P0** | **Now / next engineering** | Highest leverage on agent *quality* or process integrity inside the existing loop. Ship before marketplace or multi-agent. |
| **P1** | **Near-term product** | Completes the “serious small-team tool” story: verify, refine, vertical-slice awareness, positioning. |
| **P2** | **Medium** | Valuable after P0–P1; do not block core loop quality. |
| **P3** | **Later / nice-to-have** | Only after identity-preserving P0–P1 are solid. Easy to mis-scope into other products. |
| **P-** | **Explicitly out of scope (for now)** | Documented so they are not “accidentally” implemented. Revisit only with a strategy change. |
| **Debt** | **Engineering hygiene** | Maintainability; not a user-facing feature. |

When opening work: put the **label in the change title or issue** (e.g. `P0: richer handoff rubrics`).

---

## 4. Roadmap items (full intent)

Each item has: **priority**, **problem**, **meaning (what “done” means)**, **non-goals**, **likely touchpoints**, **acceptance ideas**.

---

### P0 — Richer prompts, role guidance, quality rubrics

**Problem:** Handoff and templates teach *protocol* more than *high-quality generation*. Agents fill skeletal `intent.md` / `design.md` without few-shots, anti-patterns, or self-checks. Mature SDD tools invest heavily here.

**Meaning (preserve when implementing):**

1. **Role-specific guidance** for planner / implementer / reviewer (and host stubs) that states:
   - what “good” looks like for the current stage artifact(s);
   - what to refuse (empty templates, invented requirements, unbounded repo dumps);
   - a short **self-evaluation checklist** before claiming stage complete.
2. **Few-shot examples** (short, real) for intent, design, tasks, acceptance — embedded in defaults or stage `agent_context.instructions`, not only in the public docs site.
3. **Handoff** remains dynamic (status, stage goal, artifacts, optional MCP, code-context) but gains a stable **“Quality bar for this stage”** section so meaning is not only in free-form chat.
4. Templates stay **short** (philosophy: not a waterfall of markdown) but stop being **content-empty**. Prefer guidance + mini examples over longer blank sections.

**Non-goals:**

- Multi-thousand-token constitutions that fight “light process.”
- Replacing human judgment with forced LLM essay generation every stage.
- Copying Spec Kit’s entire prompt surface.

**Likely touchpoints:**

- `packages/core/defaults/templates/*`
- Workflow `agent_context` in `packages/core/defaults/workflows/*.yaml`
- Agent install content in `packages/core/src/agents.ts` (role files)
- `packages/core/src/agent-handoff.ts`

**Acceptance ideas:**

- [ ] New project after `init` has non-empty stage quality guidance for hotfix + feature.
- [ ] Handoff for `implement` includes explicit anti-patterns (e.g. no full monorepo paste).
- [ ] Docs or defaults show at least one good vs bad intent example.
- [ ] Dogfood: agent produces substantive intent on a sample change without human rewriting structure.

---

### P0 — First-class agent-driven refine / clarify loop

**Problem:** `sdd refine` exists but is not the obvious, agent-driven “find gaps → clarify → update artifacts” loop practitioners expect.

**Meaning:**

1. **User-visible flow:**
   - Run refine (analyze and/or apply) on current stage or change.
   - Produce an **ambiguity / gap report** (missing decisions, contradictions, untestable acceptance).
   - Agent or human **updates artifacts** (not only a side brief).
   - Optional: soft gate or clear message that `next` is unwise until critical gaps are closed.
2. **Clarify** (where workflow has clarify/brainstorm stages) is integrated: questions → answers land in the pack.
3. Refine **never auto-rewrites `memory/constitution.md`** without explicit human intent (existing product rule).

**Non-goals:**

- Silent rewrite of all history packs.
- Autonomous infinite refine loops in CI.

**Likely touchpoints:**

- `packages/core/src/refine.ts`
- CLI `refine` command + help
- `docs/guides/refine.md`
- Templates `clarify.md`, refine brief

**Acceptance ideas:**

- [ ] `sdd refine --analyze` yields structured gaps a human can act on.
- [ ] Documented loop: refine → edit artifacts → `next`.
- [ ] Integration test or dogfood scenario with deliberately thin design.

---

### P1 — Stronger verification (still local)

**Problem:** Gates are mostly soft checklists + optional smoke. Weak mapping of acceptance → checks. “Verify” is largely human + ad-hoc.

**Meaning:**

1. **Acceptance-aware verify:**
   - From `acceptance.md` / stories / checklist items, produce a **verifiable checklist** the verify stage must address (even if initially manual ticks + notes).
2. **Executable hooks stay local:**
   - Honor workflow `verify.commands` reliably; store evidence under the change when configured.
3. **Optional LLM-as-judge (opt-in):**
   - Compare implementation notes / test output / key files summary against acceptance.
   - Default **off** or soft; never block hotfix by default.
4. Verify remains a **stage in the pack**, not a cloud CI product.

**Non-goals:**

- Full property-based test generation platform.
- Requiring org-wide CI plugin install for basic sdd use.
- Replacing unit tests with LLM judge.

**Likely touchpoints:**

- `packages/core/src/verify.ts`, `stage-gates.ts`
- Templates `acceptance.md`, local-test-*
- Workflow verify blocks in YAML

**Acceptance ideas:**

- [ ] Feature/enterprise packs surface acceptance items at verify.
- [ ] Documented way to attach command output as evidence.
- [ ] Config or flag for optional judge; default path works offline.

---

### P1 — Related changes / light epic (vertical slice awareness)

**Problem:** Packs are isolated. Hard to express “same user story / epic” or “blocks on change X” inside one product root (important for FE+BE monorepo).

**Meaning:**

1. Lightweight **relationships** on change metadata, e.g.:
   - `parent` / `epic_id` / `related: [change-id, …]` / `blocks` / `blocked_by` (exact schema TBD, keep minimal).
2. **`sdd status` / `--list`** shows siblings or blockers at a glance.
3. Handoff can mention **related open changes** so the agent does not contradict them.
4. This is **in-repo process**, not multi-repo orchestration.

**Non-goals:**

- Jira-like dependency engine across organizations.
- Multi-repo epic sync.
- Automatic code-level dependency analysis (nice later, not required).

**Likely touchpoints:**

- Change `meta.yaml` schema (`packages/core/src/schemas.ts`, change load/save)
- `formatStatus`, status command, handoff

**Acceptance ideas:**

- [ ] Can mark two changes as related; list view shows it.
- [ ] Handoff includes related titles/ids when present.
- [ ] Docs: “vertical slice = one pack when possible; related packs when split.”

---

### P1 — Positioning: comparison page + demo repos

**Problem:** Docs are good; public story vs Spec Kit / AGENTS.md-only / Kiro is weak. Low stars / visibility.

**Meaning:**

1. **Comparison page** (docs site): honest table — local packs, graduated workflows, enterprise ARB, MCP *client*, agent-agnostic, no required IDE; what Spec Kit optimizes for instead.
2. **Demo repos** (1–2):
   - Brownfield: hotfix or feature with real pack history.
   - Greenfield → promote → `sdd backlog start F-001`.
3. Links from README / home “I want to…”.

**Non-goals:**

- Paid ads / fake social proof.
- Claiming to replace Spec Kit for all users.

**Likely touchpoints:**

- `docs/concepts/` or `docs/guides/compare-*.md`
- `docs/.vitepress/config.mts` nav
- External demo repo links in README

**Acceptance ideas:**

- [ ] Published comparison page on GitHub Pages.
- [ ] At least one runnable demo path documented end-to-end.

---

### P1 — GitHub/GitLab PR helper (integration)

**Problem:** Process notes live in git, but opening a PR still rewrites the story by hand.

**Meaning:**

1. From **active change**, generate PR **title + body** from intent/feature + acceptance + status.
2. Optional: invoke `gh pr create` / equivalent when tools exist.
3. Optional: suggest branch name from change id (opt-in create).

**Non-goals:**

- Full GitHub App with webhooks as required infra.
- Two-way issue tracker sync as MVP.

**Likely touchpoints:**

- New CLI command or `sdd complete` / `sdd pr` flag
- Docs everyday-loop

**Acceptance ideas:**

- [ ] `sdd pr` (or similar) prints markdown usable as PR body.
- [ ] Works with `--no-agent`.

---

### P2 — Broader code-context language adapters

**Problem:** Pipeline is strongest on TypeScript; monorepos often include Python/Go/etc.

**Meaning:**

1. Adapter interface already exists — add **Python** (and later Go/Java) with same caps, ranking, secrets, ignore rules.
2. Fallback adapter remains for unknown languages.
3. Document language matrix honestly.

**Non-goals:**

- Perfect semantic analysis for every language on day one.
- Replacing external AST MCP sources (those remain valid).

**Likely touchpoints:**

- `packages/core/src/code-context/adapters/*`
- Tests under `__tests__/code-context*`
- `docs/guides/code-context.md`

---

### P2 — Workflow presets / publishable packs (extensibility)

**Problem:** Custom workflows exist; little tooling/docs for third parties to publish domain packs (e.g. regulated ARB variants).

**Meaning:**

1. Document **first-class pack layout** (workflow YAML + templates + optional agent_context).
2. Optional: validate command `sdd workflows validate`.
3. Optional: examples repo for “domain pack” — not a full marketplace.

**Non-goals:**

- Spec Kit-scale extension marketplace before community exists.
- Remote plugin install from arbitrary URLs without trust model.

---

### P2 — Memory synthesis agents actually respect

**Problem:** constitution/architecture exist; agents may under-load or ignore them.

**Meaning:**

1. Handoff always surfaces **constitution summary / path + must-follow rules** when present.
2. Optional short “memory map” from `memory/index.md` in handoff.
3. Init templates encourage filling constitution early (without blocking empty stub forever if product allows).

**Non-goals:**

- Auto-merging all completed packs into architecture (wiki explosion).

---

### P2 — Greenfield → backlog quality

**Problem:** Backlog rows can be thin; acceptance stubs weak.

**Meaning:**

1. Better defaults/templates for `## F-00N` rows (summary, workflow, acceptance stub).
2. Guidance when starting `sdd backlog start F-001` to seed feature/acceptance from the row.

**Non-goals:**

- Auto-implement entire product from greenfield in one pack.

---

### P2 — Optional IDE / editor status convenience

**Problem:** Power users want status without leaving the editor.

**Meaning:**

- Optional VS Code/Cursor tasks or thin panel: status, open active change folder, open handoff.
- Philosophy remains **no required extension**.

**Non-goals:**

- Marketplace extension as primary UX.

---

### P2 — Opt-in local process metrics

**Problem:** Cannot improve process without skip rates, dwell time, override frequency.

**Meaning:**

1. **Local, opt-in** metrics file (e.g. under `.sdd/`) — no phone-home by default.
2. Events: stage enter/leave, skip, gate override, complete.
3. `sdd doctor` or `sdd metrics` summary.

**Non-goals:**

- Cloud analytics product.
- Tracking source code content.

---

### P3 — Multi-agent orchestration patterns

**Meaning:** Optional patterns for parallel specialist agents with human/verify gates — only after single-agent guidance and verify are strong.

**Non-goals:** Becoming a swarm framework; default UX stays one agent + human.

---

### P3 — Issue tracker seed (GitHub Issues / Jira light)

**Meaning:** `sdd new --from ISSUE-123` seeds title/body; link stored in meta. Tracker is not system of record for stages.

---

### P3 — Status visualization

**Meaning:** Optional HTML/mermaid or docs-friendly stage history view for a change or list.

---

### P3 — Spec-as-source regeneration (library niche)

**Meaning:** Optional path for pure library components (Tessl-style) while **human-gated change packs remain default**.

---

## 5. Explicitly out of scope for now (P-)

Do **not** implement without an explicit strategy revision of this file:

| Item | Reason |
|------|--------|
| Inbound **sdd MCP server** driving process commands | Process = CLI; MCP = outbound knowledge |
| **Multi-repo sdd mesh** / cross-remote epic engine | FE+BE of one product = one root; multi-repo = sdd per product, not per tier |
| **Deprecation policy engine** as first-class product | Constitution/conventions + gates are enough unless strategy changes |
| **Cloud multi-tenant process SaaS** | Contradicts local philosophy |
| **Full Jira replacement** | Wrong product |
| **Required IDE extension** | Breaks agent-agnostic / any-editor bet |
| **Marketplace-first growth** | Zero community → empty market; pack docs first (P2) |

---

## 6. Engineering debt (Debt)

| Item | Meaning |
|------|---------|
| Split `packages/cli/src/commands.ts` | Domain modules (lifecycle, backlog, context, doctor) — maintainability only |
| Soften or justify Node `>=24` vs docs “20+” | Align engines messaging |
| Gradual `SddError` adoption for remaining `throw new Error` | Consistent CLI exit/hints |
| Keep Biome + typecheck + tests green on every PR | Already gated |

Debt items must not rewrite product identity.

---

## 7. Suggested implementation order

```text
P0  Richer prompts + rubrics + few-shots
P0  First-class refine / clarify loop
P1  Stronger local verify (acceptance-aware)
P1  Related changes / light epic
P1  Comparison page + demo repos
P1  PR body / branch helper
P2  Language adapters, pack extensibility docs, memory in handoff, metrics opt-in, IDE convenience
P3  Multi-agent, issue seed, viz, spec-as-source
Debt  Parallel, continuous
```

**Rule:** if a P2/P3 idea conflicts with §1 identity, **identity wins**.

---

## 8. How to execute a roadmap item (process)

1. Open an sdd change:  
   `sdd new "P0: …" -w feature` (or `hotfix` if tiny).
2. In the pack, paste the **Meaning** + **Non-goals** from this file (do not paraphrase away constraints).
3. Implement only against **Acceptance ideas** (expand as needed).
4. Update this ROADMAP when status changes (checkboxes or “Shipped in vX.Y” notes).
5. Prefer small PRs; do not bundle P0 prompt work with P3 multi-agent.

---

## 9. Snapshot: gaps → labels (from product review)

| Gap | Label |
|-----|--------|
| Prompt / guidance depth | **P0** |
| Refine / ambiguity loop | **P0** |
| Executable / strong verification | **P1** |
| Cross-change / epic coordination | **P1** |
| Comparison + demos / adoption story | **P1** |
| PR / git integration | **P1** |
| Language breadth (code-context) | **P2** |
| Extensibility / publishable packs | **P2** |
| Memory synthesis in handoff | **P2** |
| Observability / metrics | **P2** |
| Optional IDE surface | **P2** |
| Multi-agent orchestration | **P3** |
| Issue-tracker sync | **P3** |
| Spec-as-source regeneration | **P3** |

---

## 10. Related docs

| Doc | Role |
|-----|------|
| [README.md](./README.md) | Install + first loop |
| [docs/concepts/keep-ai-coding-in-git.md](./docs/concepts/keep-ai-coding-in-git.md) | Problem framing (SEO + product) |
| [docs/concepts/change-packs.md](./docs/concepts/change-packs.md) | Pack vs memory |
| [docs/guides/mcp.md](./docs/guides/mcp.md) | MCP **client** sources |
| [docs/maintainers/ci-cd.md](./docs/maintainers/ci-cd.md) | Release / CI for this monorepo |

---

## 11. Changelog of this roadmap

| Date | Note |
|------|------|
| 2026-08-08 | Initial roadmap from product assessment (code quality, prompts, workflows, maturity) + strategy constraints (local, not Spec Kit, MCP client-only, one product root for FE+BE, priority labels P0–P3 / P- / Debt). |
