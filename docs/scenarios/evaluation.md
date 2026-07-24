# Scenario evaluation

How `sdd` behaves on real engineering scenarios — from hotfix to enterprise. Use this as proof the tool fits teams, not only a demo script. Skim the scenario that matches your team, then open a [guide](../guides/everyday-loop) to act.

Date: 2026-07-19 | Tool: sdd CLI

## S1 — Solo hotfix (typo)
```
workflow: hotfix
```
**PASS** — hotfix path, completed pack trail. Ceremony appropriate.

## S2 — Small feature recommend
```
```
**PASS** — non-hotfix title gets heavier pack (feature/patch). Size-appropriate structure.

## S3 — Enterprise ARB + no_db skip
```
hard_gate_blocked_exit=1
 ERROR  Hard gate on stage "hl_arb" is not approved. Run sdd gate approve or complete the checklist.
```
**PASS** — governance hard gate + conditional DB skip. Real enterprise need.

## S4 — Mid-PR scope change (use + skip)
```
```
**PASS** — per-PR customization is real and persisted.

## S5 — Concurrent changes
```
```
**PARTIAL** — multi-change OK; no assignees/collaboration model.

## S6 — Brownfield init
```
existing_code_preserved=yes
still_preserved_after_new=yes
```
**PARTIAL** — safe init; no reverse-spec from code.

## S7 — Local verify before complete
```
complete_blocked_before_verify=0
```
**PASS** — quality bar before done is enforceable.

## S8 — Custom team YAML pack
```
blocked=0
```
**PASS** — team process as data without forking the tool.

## S9 — Agent handoff
```
```
**PARTIAL** — good scaffolding; agent must still open files.

## S10 — Friction / over-ceremony stress
```
stage_rows_above
```
**RISK** — tool allows wrong heavy pack; recommend helps only if user accepts it. Discipline still human.


---

## Does it solve real eng-team problems?

### Yes — core loop works

| Need | Evidence from scenarios |
|------|-------------------------|
| Structure without one rigid pipeline | S1–S4, S8: packs + recommend + per-PR use/skip |
| Spec-first for AI coding | S1–S9: always create change + artifacts first |
| Governance (ARB/peer) without SaaS | S3, S8: hard gates block progress |
| Local "done means verified" | S7: complete blocked until verify + approve |
| Audit / onboarding trail | S1: completed pack under `changes/` with meta + intent |
| Custom team process | S8: YAML only, no code change |
| Brownfield non-destructive | S6: existing code preserved |

### Partial / gaps

| Gap | Why it matters |
|-----|----------------|
| Soft gates are easy to ignore | Reviewers can still get "checkbox theater" |
| Agent handoff is path list, not grounded context | AI may still ignore specs |
| No multiplayer (assignees, comments, PR sync) | Real teams live in GitHub/Linear |
| No auto code understanding | Brownfield research is manual markdown |
| Wrong pack still choosable | S10: enterprise for rename is allowed |
| No metrics dashboard | Can't prove cycle-time improvement yet |
| IDE/Marketplace install friction | Adoption barrier for non-CLI users |

### Verdict

**For small–mid teams using AI coding assistants: yes, it addresses the right problem** — lost intent, process mismatch by change size, and missing local verification — **if the team commits to the habit** (`sdd new` / IDE equivalent) and customizes packs.

**It is not a full replacement for** project management, code review culture, or CI. It is a **local process runtime for intent → implement → verify**.

### Fit by team type

| Team | Fit |
|------|-----|
| Solo / 2–5 vibe coders | **Strong** |
| Product squad with light process | **Strong** if packs match their real steps |
| Heavy regulated enterprise | **Foundation only** — needs PR checks, identity, domain sync, metrics |
| Distributed multi-team platform | **Weak** without multiplayer + policy enforcement in CI |

### What to validate next (live week)

1. 5 real tickets: 2 hotfix, 2 feature, 1 cross-cutting  
2. Track: review rounds, "wrong approach" rework, time from intent→local green  
3. Compare 5 tickets without SDD in same week  

