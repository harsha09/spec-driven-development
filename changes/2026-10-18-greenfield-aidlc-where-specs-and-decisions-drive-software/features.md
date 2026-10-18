# Feature backlog

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`
> Each feature should fit **one PR**. Start implementation with:
> `sdd backlog start F-001`

Build in id order. Must items are the spine a non-technical person can finish. Should items are run control, agent collaboration, modules, and the trace across code and documents. The 2026-10-18 review is applied. F-001 does not accept a spec, run an agent, or cut a release.

---

## F-001: Three ways to start

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** On a page, with no command, a person starts from scratch, from a folder of existing code, or from a bug, and their original words stay the intent.
- **Requirements:** R-001
- **Notes:** Scratch and brownfield ask them to pick a folder, including where a new product lives. A bug asks what happened and what they expected. Those words remain after any later draft. No agent runs, no spec is accepted, and no release is cut.

---

## F-002: Decisions update the spec

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person accepts or corrects a short reading. That act stores a decision and updates the spec to their wording, and a replaced decision stays as its own row.
- **Requirements:** R-002, R-003, R-004, R-005
- **Notes:** The choice is their wording. The rejected option is the proposal. Intent text does not change. The section id is stable and is not a change-pack path. This works with no agent. Failure acceptance is a different decision kind and is not this feature.

---

## F-003: Decision list

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** One person sees decisions they marked as theirs and decisions they marked as the team's, and each filter shows only that mark.
- **Requirements:** R-006
- **Notes:** No second account. Opening a row shows the rejected option and the wording before and after. The list is not a chat transcript.

---

## F-004: Brownfield acceptance

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A spec proposed from existing code stays a draft until the person accepts the short reading, and that acceptance is the first decision.
- **Requirements:** R-008
- **Notes:** Uses the folder picked in F-001 and the decision write from F-002. Before acceptance, later work cannot treat the draft as the spec.

---

## F-005: Bug spec

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A bug keeps what happened and what the person expected as the intent, and the drafted spec stays a draft until they accept it.
- **Requirements:** R-009
- **Notes:** Acceptance is the first decision, same rule as brownfield. Code citation is F-006. Listing the fix on a release is F-009.

---

## F-006: Spec-driven code change

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The page lets the builder agent change code only from an accepted spec, shows that spec id, and refuses the builder in plain language when the spec is missing.
- **Requirements:** R-007
- **Notes:** The cited text is the accepted reading. An engineer's change pack stays outside this gate and is not described as a decision. A pack may cite the section as a work order. Completing a pack does not promote memory or mark the section current.

---

## F-007: QA scenarios from the spec

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** Scenarios are proposed from the accepted spec in plain language, and they count toward a release only after the person accepts them.
- **Requirements:** R-010
- **Notes:** Each scenario cites the spec section. Acceptance is a decision. An accepted scenario is required unless a decision marks it not required.

---

## F-008: QA results

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person records pass or fail in their own words against the change they approved, and the result stores that change's git SHA.
- **Requirements:** R-011
- **Notes:** The page shows their words, not a build id. An agent may propose a result and cannot write it. A pass on an older SHA does not open the gate for a later SHA.

---

## F-009: Release contents

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person names a release, chooses the accepted features and fixes in it, and the page lists only those.
- **Requirements:** R-012
- **Notes:** The choice is a decision. Generate release does not make this choice. Group by module only after F-017.

---

## F-010: Generate release notes

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** Release notes are generated from the chosen release, in the person's words, and they cite the decisions that changed behavior.
- **Requirements:** R-013
- **Notes:** Do not generate notes from commit titles. This feature writes the notes. F-011 attaches them and does not write a second copy.

---

## F-011: Generate a release

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person generates a release for items they already chose. A failing required scenario blocks it until a failure decision, and a missing git tag does not fail the release.
- **Requirements:** R-014
- **Notes:** Attaches the notes from F-010. The failure decision does not rewrite the spec. The release says when the tag was not written. No deploy and no push.

---

## F-012: Create a role agent

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person creates a named agent with one job, a durable description, and an approval boundary in their words. An empty job is refused.
- **Requirements:** R-015
- **Notes:** There is no tool form. The allow-list is derived from the boundary. The next task shows the saved job, description, and boundary. Examples they might create, each with a job, are spec steward, QA author, release editor, and builder.

---

## F-013: Autonomous run and approval

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A role agent runs several steps on its own, then stops and shows the action in plain language so the person can allow it once or deny it.
- **Requirements:** R-016
- **Notes:** No message between the steps. The stop matches the accepted reading and is not a diff. Pause, a new instruction mid-run, always-allow, and ask-first are F-021.

---

## F-014: Agents propose, people decide

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** An agent can propose a spec, a scenario, a result, or a release, and only the person principal can accept, record the result, or generate the release.
- **Requirements:** R-019, R-020
- **Notes:** The server rejects the agent principal for accept, replace, result write, generate, commit, and tag. Hiding a button is not enough. Agent memory does not change the spec or the QA result.

---

## F-015: Handoff between role agents

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** One role agent hands a task to another, and both conversations show the handoff and the records involved.
- **Requirements:** R-030
- **Notes:** Same pattern as a Grok Bot messaging another bot. The receiving agent wakes and continues. The person is not the router. Not part of the first demo.

---

## F-016: Scheduled routines

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** A role agent has a routine with a schedule, a next run, a history, and a pause control.
- **Requirements:** R-031
- **Notes:** A routine may propose a QA result and cannot write it. Pausing the routine does not delete history.

---

## F-017: Modules

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** The person groups specs, scenarios, and releases into modules, and a feature or bug names the modules it belongs to.
- **Requirements:** R-032
- **Notes:** This is the base for later integration. This feature is the map and the filter. It does not yet connect two modules.

---

## F-018: Integrate two modules

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** A connection between two modules is its own spec with scenarios, and accepting it does not rewrite the other modules' decisions.
- **Requirements:** R-033
- **Notes:** Depends on F-017. The integration spec cites both modules. Existing accepted specs keep their decision ids.

---

## F-019: One chain from notes to code

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** From a release-note line the person can open the decision, the spec, the scenario, the result, and the code citation even if the local database is gone.
- **Requirements:** R-034
- **Notes:** Ids are shared. The documents are renderings of the committed projection, not separate copies someone edits by hand.

---

## F-020: Duplicate a role agent

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** The person duplicates an agent for a new scope and gets the job and the rules without the old conversation.
- **Requirements:** R-035
- **Notes:** Same idea as duplicating a Grok Bot. Credentials and conversation history stay behind.

---

## F-021: Run control and standing approval rules

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** The person can pause a run, send an instruction mid-run, always-allow one exact action, and set an ask-first rule that wins.
- **Requirements:** R-017, R-018
- **Notes:** The runner matches tool name plus the same input fields. The model does not decide the match. Depends on F-013. Not part of the first demo.

