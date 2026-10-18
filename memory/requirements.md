# Requirements

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`
> Prefer testable statements. Avoid UI pixel detail unless critical.

The person builds by accepting a short reading. An agent writes code from that accepted spec. Every acceptance is a decision. Reviewed by the product manager, product owner, and architect on 2026-10-18. Their shared verdict is applied below.

## Must have

| ID | Requirement | Acceptance signal |
|----|-------------|-------------------|
| R-001 | The person can start from scratch, from existing code, or from a bug, on a page, in their own words. Scratch and brownfield ask them to pick a folder. They do not type a command or a path. | Each start keeps their original words. Scratch and brownfield show the folder they picked. No agent runs and nothing is accepted. |
| R-002 | The original words stay the intent. What the person accepts or corrects is a short reading in their words, not spec-template fields. A correction stores a decision whose choice is their wording and whose rejected option is the proposal. No spec edit exists that does not store a decision. | After a correction, the intent text is unchanged, the spec matches their wording, and the decision records both the proposal and their wording. |
| R-003 | A decision records the choice in plain language, the options considered, who chose it, when, and which spec section it changed. Who is a label, either the person or the team, on one machine. | One stored decision shows those fields. The actor is a label, not an agent run and not a second account. |
| R-004 | Accepting a reading updates that spec section and stores the decision id on it in the same write. The section id is stable and is not a change-pack path. The text the code later cites is that same reading. | The section cites the decision id. The previous wording is still on the decision. The cited spec text and the accepted reading are the same string. |
| R-005 | A later decision replaces an earlier one by adding a row. The old row stays, marked replaced, and points at the new one. | The list shows the old decision as replaced and the new one as current. The old row's text is unchanged. |
| R-006 | The person can view decisions marked as theirs and decisions marked as the team's, and filter by that mark. | With one person, both marks exist, and each filter returns only that mark. |
| R-007 | The builder agent may change product code only from an accepted spec, and the change cites that section. The page refuses it in plain language when the spec is missing. An engineer's own change pack is outside this gate, and a release does not claim that pack cited a decision. | The page blocks the builder with no accepted spec id. An allowed change shows that id. An engineer pack can still be completed and is absent from the decision chain. |
| R-008 | A spec proposed from existing code is a draft until the person accepts the short reading. That acceptance is the first decision. | Before acceptance the spec is labeled draft. After acceptance it is current and the decision exists. |
| R-009 | A bug stores what happened and what the person expected as the intent. A proposed spec is drafted from that pair and stays a draft until they accept it. That acceptance is the first decision. | The bug page still shows their two statements after the draft exists. The fix is refused until the acceptance decision exists. |
| R-010 | A QA scenario is written from the accepted spec, in plain language, and cites the spec section. It stays a proposal until the person accepts it, and that acceptance is a decision. Every accepted scenario is required unless a decision marks it not required. | An unaccepted scenario cannot open the release gate. An accepted one can. A decision can mark one not required, and the gate then ignores it. |
| R-011 | The person records pass or fail in their own words against the change they approved. The record also stores that change's git SHA. An agent may propose a result and cannot write it. An older pass does not cover a newer SHA. | The page shows their words. The stored result has the SHA. An agent run leaves the result unchanged. A pass on an older SHA does not satisfy the gate for a later SHA. |
| R-012 | The person names a release and chooses which accepted features and fixes are in it. That choice is a decision. The page lists only those items. | A feature they did not choose is absent. The choice is a stored decision. |
| R-013 | Release notes are generated from the release records, in the person's language, and cite the decisions that changed behavior. | The notes mention each included item and the decision id. They do not quote commit titles. |
| R-014 | Generate release checks the gate for the items the person already chose. It writes the release record and attaches the notes already generated. It does not pick contents and does not write a second set of notes. A failing required scenario blocks it until a failure-acceptance decision. That decision does not rewrite the spec. If a local git tag cannot be written, generation still succeeds and the release says the tag was not written. It does not deploy or push. | With a failing required scenario, generation is refused. After the failure decision, generation succeeds, the spec text is unchanged, and a missing tag is reported on the release. No deploy occurs. |
| R-015 | The person creates a role agent with a name, one job, a durable description, and an approval boundary written in their words. An empty job is refused. The tool allow-list is derived from the boundary. The person does not fill a tool form. | Save fails when the job is empty. The next task shows the saved job, description, and boundary without pasting them again. |
| R-016 | After a task is given, the role agent takes several steps with no message between them, then stops at the approval boundary. The stop shows the proposed action and its inputs in plain language, matching the accepted reading. The person may allow once or deny. | A three-step task does not ask for a message between steps. The stop is readable without a diff. Deny blocks that action. Allow once performs it and does not allow the next different action. |
| R-019 | An agent cannot accept a spec, replace a decision, write a QA result, generate a release, commit, or tag. Only the person principal can. Hiding a button is not the control. The server rejects the agent principal too. | An agent call to each of those actions is rejected. The same call from the person principal stores a decision where the action is an acceptance. |
| R-020 | Agent memory may keep working preferences and summaries. It is not the spec, the decision list, or the QA record. The spec changes only through a decision. | Changing memory leaves the spec and the latest QA result unchanged. |

## Should have

| ID | Requirement | Acceptance signal |
|----|-------------|-------------------|
| R-017 | While an agent is running, the person can see the current step, send another instruction, pause, and resume. | The page shows the current step. A new instruction is taken up. Pause stops the next step until resume. |
| R-018 | Besides allow once and deny, the person can always-allow a match or set an ask-first rule. A match is the tool name plus the same input fields, decided by the runner. If both match, ask-first wins. The model does not decide the match. | Always-allow repeats only that tool and those fields. A different tool still stops. An ask-first rule stops the action even when always-allow also matches. |
| R-030 | A role agent can hand work to another role agent. The handoff is visible in both conversations and names the task and the records involved. | The receiving agent wakes, completes the task, and both transcripts show the handoff. |
| R-031 | The person can give a role agent a routine with a schedule and an instruction. They can see the next run and the run history, and they can pause the routine. A routine may propose a QA result and cannot write it. | A routine runs at the scheduled time and the history shows the run. Pause prevents the next run. The QA result stays unchanged until the person records it. |
| R-032 | A product is divided into modules. A feature or bug belongs to one or more modules. The person can see a module's specs, scenarios, and the releases that touched it. | Expenses and Billing are separate modules. A feature opened from Expenses does not appear as owned by Billing unless it was linked. |
| R-033 | A connection between two modules is its own spec, with scenarios that prove the connection. Adding a module does not rewrite the other module's accepted specs. | An integration spec cites both modules. Accepting it leaves the other specs' decision ids unchanged. |
| R-034 | Code, spec documentation, and release documentation for one outcome share one chain of ids, from intent to decision to spec to scenario to result to release to the code change. The chain resolves from the committed projection if the local database is missing. | From a line in the release notes, the person can open the decision, the spec section, the scenario, the result, and the code citation without the database file. |
| R-035 | The person can duplicate a role agent for a new scope. The copy takes the job, description, and approval boundary, and does not take the original conversation. | The copy has the same description and an empty conversation. |

## Nice to have (later)

- Several role agents in one group conversation, with visible handoffs, as Grok Bot group chats do.
- Sharing an agent as a template another person can add, without sharing conversation history or credentials.
- A shared cloud computer, browser use of arbitrary sites, and a mobile client.
- Deploying a generated release to a host. v1 stops at the release record, the notes, and a best-effort local git tag.

## Assumptions

- v1 is one person on one machine. "Team" is a label on a decision, not a second account.
- The existing `sdd` engine remains how an engineer moves a change pack. That pack is a work order citing a stable spec section. It is not the spec and not the decision list.
- Role agents follow the Grok Bot shape for v1 only as far as one job, a durable description, an autonomous run, and a stop for allow once or deny. Pause, always-allow, ask-first, handoff, and routines come after that spine.
- Starter roles such as spec steward, QA author, release editor, and builder are examples the person can create, each with a job. The product does not ship a jobless general helper.

## Risks

- An agent that accepts its own spec, writes its own QA pass, or ships a release recreates AI-SDLC. R-019 is the guard, enforced in the server, not only in the prompt.
- Treating brownfield code or a bug's raw words as the accepted spec lets the code drive the next change. R-008 and R-009 are the guards.
- A gitignored database as the only copy of a decision loses who decided and what they rejected. R-034 requires a committed projection.
- Showing a diff at the approval stop asks this person to read code. R-016 requires the accepted reading in plain language.
- A release note written by hand will not match the decisions. R-013 requires generation from the release records.

---

_Promoted from greenfield change `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`._
