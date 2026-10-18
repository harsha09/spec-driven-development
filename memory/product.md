# Product vision

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software` · 2026-10-18
> Greenfield — keep the **smallest useful product**.

## One-liner

AIDLC where specs and decisions drive software for non-technical people.

## Who is this for?

The person who knows what the software should do and does not write code. They start a product, continue a product that already has code, or report a bug. They decide what is correct. A coding agent writes and changes the code from the spec they accepted.

On one machine they can mark a decision as theirs or as the team's. That mark is a label, not a second account.

## Problem

A non-technical person can ask an assistant to build software, and the reason for each choice disappears into the chat. The code moves on. The next change guesses again. Release notes, QA notes, and the spec drift apart because they are written as separate documents.

AI-SDLC keeps the old lifecycle and adds an assistant at each step. The person still has to run a technical process, and the decision still lives in a conversation. This product is AIDLC. The spec is how the person builds. The agent executes. A decision is stored in the spec, and later code, checks, and release notes point at that decision.

## Approaches considered

This is the brainstorm for the greenfield. The greenfield workflow has no separate brainstorm stage, so the approaches and the choice are recorded here before requirements.

**Approach A. Friendly forms over the existing spec files.** The person fills problem, scope, non-goals, and success criteria, and the app writes markdown. Rejected. Those fields are the builder's job. The person learns the spec template under new labels, and the value still flows to the coding agent.

**Approach B. Chat only.** The person talks, the agent builds, and a transcript is the record. Rejected. A transcript is not a spec. A later session can contradict an earlier one, and a release cannot say which decision shipped.

**Approach C. AIDLC records, chosen.** The person speaks in their own words. The product keeps that intent. An agent proposes a short reading and the spec text. The person accepts or corrects it. Acceptance is a decision, and the decision updates the spec. Code, QA scenarios, QA results, the release, and the release notes cite the same ids. Role agents do the drafting and the building. They run on their own and stop where the person set an approval boundary.

**Agent shape inside approach C.** Copying Grok Bot's cloud computer, marketplace, and voice chat is out of the first version. The first version copies one job, a durable description, its own conversation, a multi-step run, and a stop where the person allows the action once or denies it. Handoff, routines, pause, and standing allow rules come after that. Working memory helps the agent. It is not the spec. Sources: Grok Bot overview and bot management at https://docs.x.ai/grok-bot/overview and https://docs.x.ai/grok-bot/bots, and approvals at https://docs.x.ai/grok-bot/approvals-security-and-privacy.

## Chosen approach

Approach C. The smallest useful product lets one person do five things.

1. Start from scratch, from existing code, or from a bug, in their own words, and pick where the product lives.
2. Accept or correct a short reading, and see that choice later as a decision.
3. Accept QA scenarios that came from the spec, and record pass or fail in their own words.
4. Choose which features and fixes are in a release, generate the notes, and generate the release when the required checks passed or they accept a failure.
5. Create one role agent, give it a job and an approval boundary, and let it run until it finishes or must ask.

## MVP success (how we know it worked)

A person who does not use a terminal can complete this path on one product.

The first demo is one new product. They describe a capability in one sentence. They accept or correct a short reading, and that act is the decision. A role agent they created proposes the code change and stops before writing it. They allow it once. The code cites that same reading. They accept one scenario and record its result in their words. Generate release is refused while that scenario is failing. The notes use their sentence, not commit titles.

A bug and a product that already has code follow the same rule. Their words stay the intent. A drafted spec is not current until they accept it, and that acceptance is the first decision.

The agent cannot mark the spec accepted, record the result, or ship the release. A second agent and a handoff are not part of this demo.

## Non-goals (explicitly out of v1)

- A cloud computer with a browser and desktop shared by every agent.
- A marketplace of public agent templates, voice chat, and a mobile client.
- Replacing the `sdd` CLI for engineers. Engineers can still use change packs. This product is the control surface for the person who decides.
- Search, token budgets, and the open search epic. Those stay separate work.
- Letting an agent change a spec, deploy, or publish a release without a stored decision.

## Constraints

- Time box: the first build is the record spine plus one autonomous role agent that stops for a single allow or deny. Pause, standing allow rules, routines, handoff, and modules are specified and built after that demo.
- Platforms: a local web app in this TypeScript monorepo, bound to the person's machine for v1. Shared hosting is later.
- Compliance / privacy: agent working memory is not an authority. Specs, decisions, and QA results are the records that can be reviewed. An approval shows the action and its inputs before the person allows it.

## Review

On 2026-10-18 the product manager, product owner, and architect accepted this direction with changes. Those changes are in the requirements, the backlog, and the architecture. The first demo does not include a second agent.

## Open questions

- Closed: records live in a local database used as an index, and each acceptance is also committed as an append-only decision plus the spec text. The id resolves without the database.
- Closed: v1 generates the release record and attaches the notes. A local git tag is written when it can be. A missing tag is reported and does not fail the release. Deploy is later.

---

_Promoted from greenfield change `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`._
