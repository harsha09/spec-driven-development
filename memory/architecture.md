# High-level architecture

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`
> MVP only — postpone scale fantasies.

## Context

AIDLC is a local web app in this repo. A non-technical person starts work, accepts decisions, reads QA, and cuts a release. Role agents draft and build. The `sdd` CLI stays the engineer-facing engine for change packs. This greenfield does not replace that CLI.

The app touches three places: the person's browser, a local record store, and the git working tree of the product being built. v1 binds to localhost. It does not host a multi-tenant service and it does not give agents a shared cloud computer.

## Major components

| Component | Responsibility |
|-----------|----------------|
| Studio | The pages the person uses: start, decisions, spec reading, QA, releases, and agents. |
| Record store | Local database of intents, decisions, specs, modules, scenarios, results, releases, agents, runs, and approvals. |
| Spec publisher | Writes the accepted spec into git and refuses to mark a draft as accepted. |
| Agent runner | Runs one role agent through tool steps until the task ends or an approval boundary stops it. |
| Approval gate | Shows the proposed action and its inputs. Applies allow once, always allow, and deny. Ask-first overrides always allow. |
| sdd core | Existing change-pack engine. Used when an accepted spec becomes an engineer-visible change. Not a second copy of the decision list. |

## Data

Records share ids. A spec section stores the decision id that last set it. A scenario stores the spec section id. A result stores the scenario id and the build id. A release stores the feature and bug ids it includes, and any decision that accepted a failing scenario. A code change stores the spec section id it followed. Release notes are rendered from the release. They are not a separately edited document.

An agent has a name, one job, a durable description, an allow-list of tools, and an approval boundary. A run has a transcript, the current step, and pause state. Agent memory is a side store of preferences and summaries. No reader treats it as the spec.

v1 uses one SQLite file under `.sdd/`, gitignored, plus the published spec files in the product repo. The same tables are the shape of a later shared database. The publisher is what keeps code, spec documentation, and release documentation on one chain.

## Key flows

1. Start. The person writes an intent. Studio stores the words. The spec steward agent, if one exists, drafts a spec and stops. The person accepts. The record store writes a decision and the publisher writes the spec into git.
2. Build. The builder agent may open a code change only when the spec section is accepted. The change cites that section. If the boundary says code edits need approval, the runner stops and shows the diff.
3. Check. The QA author drafts scenarios that cite the spec. A run records pass or fail against a build. The person reads both on the feature.
4. Release. Studio lists the features and fixes in the release. Generate notes renders them from the records. Generate release checks required results, or requires an acceptance decision, then writes the release record, the notes, and a git tag.
5. Brownfield. The runner proposes a spec from the tree. Studio labels it draft. Acceptance is the first decision. Until then the publisher does not present it as current.
6. Handoff, after F-015. One agent sends a task and the record ids to another agent. Both transcripts show the message. The person does not copy it between them.

## Tech choices (provisional)

- Stay in this pnpm TypeScript monorepo. Add a `packages/studio` app and a small local server. Call `packages/core` for change packs rather than reimplementing stages.
- SQLite for the record store in v1. Postgres is the same schema when more than one machine shares a product.
- Role agents call the model through the project's configured provider. The runner is ours: it owns the loop, the tool allow-list, the pause state, and the approval gate. The model does not own those.
- Tools in v1 are record tools and repo tools: read and propose specs, scenarios, notes, and code. Deploy, email, and merge are not tools until a later feature puts them behind approval.
- Do not clone Grok Bot's cloud desktop. Do copy its role shape: one job, durable description, own conversation, autonomous steps, approval stop, visible handoff, and routines.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| The agent accepts its own spec and the decision list is empty. | The runner has no tool that writes a decision. Studio writes a decision only from a person's acceptance. |
| Brownfield code is treated as the spec. | Draft status is explicit. Publisher and code tools require an accepted spec id. |
| Agent memory and the spec disagree. | Pages read the record store. Memory is not on the decision or release pages. |
| Release notes drift from decisions. | Notes are a rendering. There is no second editor for them in v1. |
| This greenfield overwrites the CLI's own product memory. | Promotion fills `memory/` in this branch with the AIDLC spine. The CLI constitution stays. Implementation work starts with `sdd backlog start`, and it must not fold Studio into unrelated CLI changes. |
| Ask-first is bypassed by a broad always-allow rule. | When both match, ask-first wins. The approval record stores which rule fired. |

## Open questions

1. Open: which model provider Studio calls in the first PR. The runner should take a provider interface so F-012 does not hard-code one vendor.
2. Open: whether the published spec is a normal `sdd` change pack or a stable `specs/` tree keyed by record id. F-006 can start with a change pack. F-019 may need stable ids that outlive one change folder.
3. Open: git tag permissions on a machine where the person is not a committer. v1 can write the tag in the local clone and leave push for the person to allow.

---

_Promoted from greenfield change `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`._
