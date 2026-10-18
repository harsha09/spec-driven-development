# Product vision

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software` · 2026-10-18
> Greenfield — keep the **smallest useful product**.

## One-liner

AIDLC where specs and decisions drive software for non-technical people.

## Who is this for?

The person who knows what the software should do and does not write code. They start a product, continue a product that already has code, or report a bug. They decide what is correct. A coding agent writes and changes the code from the spec they accepted.

A teammate can take part in the same decisions. The page shows which decisions were theirs and which were the team's.

## Problem

A non-technical person can ask an assistant to build software, and the reason for each choice disappears into the chat. The code moves on. The next change guesses again. Release notes, QA notes, and the spec drift apart because they are written as separate documents.

AI-SDLC keeps the old lifecycle and adds an assistant at each step. The person still has to run a technical process, and the decision still lives in a conversation. This product is AIDLC. The spec is how the person builds. The agent executes. A decision is stored in the spec, and later code, checks, and release notes point at that decision.

## Approaches considered

This is the brainstorm for the greenfield. The greenfield workflow has no separate brainstorm stage, so the approaches and the choice are recorded here before requirements.

**Approach A. Friendly forms over the existing spec files.** The person fills problem, scope, non-goals, and success criteria, and the app writes markdown. Rejected. Those fields are the builder's job. The person learns the spec template under new labels, and the value still flows to the coding agent.

**Approach B. Chat only.** The person talks, the agent builds, and a transcript is the record. Rejected. A transcript is not a spec. A later session can contradict an earlier one, and a release cannot say which decision shipped.

**Approach C. AIDLC records, chosen.** The person speaks in their own words. The product keeps that intent. An agent proposes a short reading and the spec text. The person accepts or corrects it. Acceptance is a decision, and the decision updates the spec. Code, QA scenarios, QA results, the release, and the release notes cite the same ids. Role agents do the drafting and the building. They run on their own and stop where the person set an approval boundary.

**Agent shape inside approach C.** Copying Grok Bot's cloud computer, marketplace, and voice chat is out of the first version. The behavior to replicate is the bot model documented for Grok Bot: a named teammate with one job, a durable description, its own conversation, an autonomous multi-step run, a stop for approval, and a handoff to another bot. Working memory helps the agent. It is not the spec. The spec and the decisions remain the source of truth. Sources: Grok Bot overview and bot management at https://docs.x.ai/grok-bot/overview and https://docs.x.ai/grok-bot/bots, and approvals at https://docs.x.ai/grok-bot/approvals-security-and-privacy.

## Chosen approach

Approach C. The smallest useful product lets one person do five things.

1. Start from scratch, from existing code, or from a bug, in their own words.
2. Accept or correct a proposed spec, and see that choice later as a decision.
3. See QA scenarios that came from the spec, and the pass or fail on a build.
4. See which features and fixes are in a release, generate the release notes, and generate the release when the required checks passed or they explicitly accept a failure.
5. Create a role-specific agent, give it a job and an approval boundary, and let it run until it finishes or must ask.

## MVP success (how we know it worked)

A person who does not use a terminal can complete this path on one product.

They describe a new capability in a sentence. They accept a short reading. The spec updates, and the decision lists their name and the options they did not take. A role agent they created proposes the code change and stops before writing it, because code changes are behind the approval boundary. They allow it. The code cites the spec. QA scenarios from that spec are visible. A result is recorded against a build. They generate release notes that mention the capability in their words, and they generate the release only after the required scenario passed.

The same path works for a bug. For existing code, a proposed spec is not treated as accepted until they accept it, and that acceptance is the first decision.

A second role agent can be asked to draft the scenarios. The handoff is visible. Neither agent can mark the spec accepted or ship the release by itself.

## Non-goals (explicitly out of v1)

- A cloud computer with a browser and desktop shared by every agent.
- A marketplace of public agent templates, voice chat, and a mobile client.
- Replacing the `sdd` CLI for engineers. Engineers can still use change packs. This product is the control surface for the person who decides.
- Search, token budgets, and the open search epic. Those stay separate work.
- Letting an agent change a spec, deploy, or publish a release without a stored decision.

## Constraints

- Time box: the first build is the record spine plus one autonomous role agent. Module integration and scheduled routines are specified now and built after the spine is demonstrable.
- Platforms: a local web app in this TypeScript monorepo, bound to the person's machine for v1. Shared hosting is later.
- Compliance / privacy: agent working memory is not an authority. Specs, decisions, and QA results are the records that can be reviewed. An approval shows the action and its inputs before the person allows it.

## Open questions

- Open: whether v1 stores records only in git, or in a local database that publishes the spec into git. The architecture stage recommends a local database plus a git projection so the person can list decisions without reading files, and the code still sits next to the spec.
- Open: whether "generate a release" in v1 tags a git version and writes the notes, or also deploys. v1 generates the release record, the notes, and the git tag. Deploy stays behind an approval and can be a later feature.
