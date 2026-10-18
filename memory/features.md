# Feature backlog

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`
> Each feature should fit **one PR**. Start implementation with:
> `sdd backlog start F-001`

Build in id order. Must items are the spine. Should items are the agent collaboration, modules, and the trace across code and documents.

---

## F-001: Three ways to start

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A person starts from scratch, from existing code, or from a bug, in their own words, and the original words stay as the intent.
- **Requirements:** R-001, R-002
- **Notes:** No command line. Scratch creates an empty product. Brownfield asks for the code location. A bug asks what happened and what they expected. Show the intent unchanged after a spec draft exists.

---

## F-002: Decisions update the spec

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** Accepting a proposal stores a decision and updates the cited spec section. A replaced decision stays visible and points at the decision that replaced it.
- **Requirements:** R-003, R-004, R-005
- **Notes:** A decision has the choice, the options, who decided, when, and the spec section. The section stores the decision id. Do not store the decision only as a chat message.

---

## F-003: Decision list

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person sees their decisions and the team's decisions, and can filter by who decided.
- **Requirements:** R-006
- **Notes:** Each row is plain language plus the feature it changed. Opening a row shows the rejected options and the spec text before and after.

---

## F-004: Brownfield acceptance

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A spec proposed from existing code stays a draft until the person accepts it, and that acceptance is the first decision.
- **Requirements:** R-008
- **Notes:** Before acceptance, later work cannot treat the draft as the spec. After acceptance, new work starts from that spec.

---

## F-005: Bug spec

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A bug keeps what happened and what the person expected, and the fix has to cite that spec.
- **Requirements:** R-009
- **Notes:** The bug appears later in the release that contains the fix. Do not describe the bug only as a commit message.

---

## F-006: Spec-driven code change

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** Product code changes only from an accepted spec, and the change cites the spec section it followed.
- **Requirements:** R-007
- **Notes:** Refuse a code change that has no accepted spec id. The citation is what release notes and QA use later.

---

## F-007: QA scenarios from the spec

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** Each accepted spec can produce scenarios in plain language, and each scenario cites the spec section it checks.
- **Requirements:** R-010
- **Notes:** The person can read a scenario without a test framework. Generating scenarios is a proposal until they accept it.

---

## F-008: QA results

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A scenario shows pass or fail on a build, and a failure includes what was observed.
- **Requirements:** R-011
- **Notes:** Results are per scenario and build. The latest result is what the release gate reads.

---

## F-009: Release contents

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person opens a named release and sees the features and bug fixes that are in it.
- **Requirements:** R-012
- **Notes:** Work that is not in the release does not appear. Group rows by module once F-017 exists. Before that, a single list is enough.

---

## F-010: Generate release notes

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** Release notes are generated from the release, in the person's words, and they cite the decisions that changed behavior.
- **Requirements:** R-013
- **Notes:** Do not generate notes from commit titles. Regenerating after a decision change updates the notes.

---

## F-011: Generate a release

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person can generate a release when required scenarios passed, or when a decision accepts a failure, and the release cites that decision.
- **Requirements:** R-014
- **Notes:** v1 writes the release record, the notes, and a git tag. It does not deploy. A failing required scenario blocks generation until an acceptance decision exists.

---

## F-012: Create a role agent

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** The person creates a named agent with one job, a durable description, the tools it may use, and an approval boundary.
- **Requirements:** R-015
- **Notes:** Model this on a Grok Bot. The description holds lasting rules. The task message holds one assignment. A general helper with no job is allowed but the create screen asks for one job. Examples the person might create: spec steward, QA author, release editor, builder.

---

## F-013: Autonomous run and approval

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A role agent runs a multi-step task on its own, shows progress, accepts a new instruction, and stops at the approval boundary with allow once, always allow, or deny.
- **Requirements:** R-016, R-017, R-018
- **Notes:** Ask-first wins when it overlaps an always-allow rule. Pause and resume are part of this feature. The approval shows the action and its inputs.

---

## F-014: Agents propose, people decide

- **Status:** planned
- **Priority:** must
- **Workflow:** feature
- **Summary:** A role agent can propose a spec, a scenario, or a release, and only the person's acceptance writes the decision and changes the record.
- **Requirements:** R-019, R-020
- **Notes:** Agent memory may store preferences. It must not be read as the spec. An agent-only run leaves drafts unaccepted.

---

## F-015: Handoff between role agents

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** One role agent hands a task to another, and both conversations show the handoff and the records involved.
- **Requirements:** R-030
- **Notes:** Same pattern as a Grok Bot messaging another bot. The receiving agent wakes and continues. The person is not the router.

---

## F-016: Scheduled routines

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** A role agent has a routine with a schedule, a next run, a history, and a pause control.
- **Requirements:** R-031
- **Notes:** A useful first routine is the QA author recording results after a build. Pausing the routine does not delete history.

---

## F-017: Modules

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** The person groups specs, scenarios, and releases into modules, and a feature or bug names the modules it belongs to.
- **Requirements:** R-032
- **Notes:** This is the base for later integration. v1 of this feature is the map and the filter. It does not yet connect two modules.

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
- **Summary:** From a release-note line the person can open the decision, the spec, the scenario, the result, and the code citation.
- **Requirements:** R-034
- **Notes:** This is how code, spec documentation, and release documentation stay one system. Ids are shared. The documents are renderings, not separate copies someone edits by hand.

---

## F-020: Duplicate a role agent

- **Status:** planned
- **Priority:** should
- **Workflow:** feature
- **Summary:** The person duplicates an agent for a new scope and gets the job and the rules without the old conversation.
- **Requirements:** R-035
- **Notes:** Same idea as duplicating a Grok Bot. Credentials and conversation history stay behind.

---

_Promoted from greenfield change `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`._
