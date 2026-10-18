# High-level architecture

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`
> MVP only — postpone scale fantasies.

## Context

AIDLC is a local web app. A non-technical person starts work, accepts a short reading, records QA, and cuts a release. One role agent drafts and builds, and stops for a single allow or deny. The `sdd` CLI stays the engineer-facing engine for change packs. This greenfield does not replace that CLI.

The app touches three places: the person's browser, a local record index, and the git working tree of the product being built. v1 binds to localhost. It does not host a multi-tenant service and it does not give agents a shared cloud computer.

Engineers keep implementing backlog items with `sdd backlog start` in this repo. That path is not the product the person uses.

## Major components

| Component | Responsibility |
|-----------|----------------|
| Studio | The localhost pages. Collects the person's words, shows records, and sends acceptance. It does not run the model and it does not decide. |
| Record store | The only API that inserts a decision. It tells a person principal from an agent run and rejects the agent for accept, result write, release, commit, and tag. |
| Spec publisher | After a person accepts, commits the append-only decision and the spec text into the product repo. It does not accept, and it does not call `promoteGreenfieldToMemory`. |
| Agent runner | An in-process loop for one role agent: tool allow-list, one step at a time, approval stop. It proposes. It is not `packages/cli` launch-agent and not `packages/core/src/agents.ts`. |
| Approval gate | v1 shows the action and its inputs in the words of the accepted reading, then allow once or deny. Standing allow and ask-first arrive with F-021. |
| sdd core | Stages, one active change, and backlog status in `packages/core`. A pack may be a work order that cites a spec section. It is not the decision list and not the living spec. |

## Data

SQLite is the index. It is not stored under `.sdd/`. Each acceptance also commits an append-only projection, decision text plus spec text, in the product repo. A section id resolves from that projection when the database file is missing.

A spec section id is stable. It is not a change-pack path. The publisher is the only writer of accepted spec text. Completing a pack must not promote `memory/` and must not mark a section current.

`Decision.kind` is `spec_accept` or `failure_accept`. Only `spec_accept` changes a section body. F-002 implements `spec_accept`. The column exists from the start. F-011 writes `failure_accept` and does not rewrite the section.

A QA result stores the person's words and the git SHA of the change they approved. A pass on an older SHA does not satisfy a later SHA.

An agent has a name, one job, a durable description, and an approval boundary. The tool allow-list is derived from that boundary. No field on the agent can accept a spec, write a decision, or generate a release. Agent memory is referenced by none of the product records.

Before F-012, an approval rule matches tool name plus the same input fields inside the runner. The model does not judge the match. v1 only needs allow once and deny. The match columns exist so F-021 can add always-allow and ask-first without a second store.

The publisher never writes outside the product repo the person picked, and never into this repo's `memory/`.

## Key flows

1. Start, F-001. The person writes an intent and picks a folder. Studio stores the words. No agent, no draft acceptance, and no commit.
2. Decide, F-002. The person accepts or corrects a short reading. The record store writes `spec_accept` and the publisher commits the projection. The spec text becomes their wording.
3. Build, F-006. The builder agent may change code only when the section is accepted. The change cites that section. The stop shows the accepted reading, not a diff. The runner has no `createChange` and no uncited write.
4. Check, F-007 and F-008. Scenarios are proposals until the person accepts them. The person records pass or fail in their words. An agent may propose the result and cannot write it.
5. Release, F-009 through F-011. The person chooses the contents. Notes are generated once. Generate release checks required results for those items, attaches the notes, and writes a local tag when it can. A missing tag is recorded. There is no deploy.
6. Brownfield and bug. The proposal stays a draft. Acceptance is the first `spec_accept`. Until then the publisher does not present it as current.
7. Handoff and routines stay unwired until F-015 and F-016. Creating an intent does not require an agent.

## Tech choices (provisional)

- Stay in this pnpm TypeScript monorepo. Add a `packages/studio` app and a small local server. Call `packages/core` for engineer work orders rather than reimplementing stages.
- SQLite for the index in v1. Postgres is the same schema when more than one machine shares a product. The committed projection is the copy that survives a lost database.
- The runner calls the model through a provider interface. F-012 does not hard-code a vendor. The runner owns the loop, the allow-list, and the gate.
- v1 tools read records and propose specs, scenarios, notes, and code. Commit, tag, deploy, email, and merge are not agent tools.
- Do not clone Grok Bot's cloud desktop. v1 copies one job, a durable description, an autonomous run, and a single allow or deny.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| The agent accepts its own spec or writes its own QA pass. | Only the person principal inserts a decision or a result. The server rejects the agent principal. The prompt is not the control. |
| Brownfield code is treated as the spec. | Draft status is explicit. Publisher and builder tools require an accepted section id. |
| Agent memory and the spec disagree. | Pages read the record store and the projection. Memory is not on the decision, QA, or release pages. |
| Release notes drift from decisions. | Notes are one rendering. F-011 does not write a second copy. |
| Decisions exist only in a gitignored database. | Each acceptance commits the decision and the spec. The id resolves without SQLite. |
| `createChange` steals the engineer's active change. | The runner cannot call it. A pack, when F-006 opens one, is a work order under the publisher's rules. |
| Localhost is treated as authentication. | The store checks the principal. Hiding a button does not authorize the agent. |
| The person is shown a diff. | The stop shows the accepted reading in plain language. |
| A model-judged always-allow match lets an action through. | The runner matches tool name and input fields. Ask-first wins when F-021 adds it. |
| This greenfield overwrote the CLI's product memory on this branch. | Implementation starts with `sdd backlog start`. Studio must not promote `memory/` or fold into unrelated CLI changes. |

## Open questions

1. Open: which model provider Studio calls first. The runner takes a provider interface so the choice is not buried in F-012.
2. Closed: the living spec is a stable projection keyed by section id, not an `sdd` change pack. A pack may cite that id as a work order.
3. Closed: a local git tag is best effort. Generation succeeds when the tag cannot be written, and the release says so. Push and deploy are not v1.

