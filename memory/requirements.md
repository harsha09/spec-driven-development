# Requirements

> **Greenfield: AIDLC where specs and decisions drive software for non-technical people** · `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`
> Prefer testable statements. Avoid UI pixel detail unless critical.

The person builds by accepting specs. An agent writes code from an accepted spec. Every acceptance is a decision that stays attached to the spec.

## Must have

| ID | Requirement | Acceptance signal |
|----|-------------|-------------------|
| R-001 | The person can start work in three ways: describe a new product, point at a product that already has code, or describe a bug. They do this in their own words and do not type a command. | Three starts each create an intent record that still contains their original words after the spec is drafted. |
| R-002 | The product keeps the person's original words as the intent, separate from the spec the agent drafts. | Opening the work shows both "what you asked" and the current spec, and editing the spec does not erase the intent. |
| R-003 | A decision records the choice in plain language, the options that were considered, who chose it (the person or the team), when, and which spec section it changed. | A stored decision can be opened and shows all five of those fields. |
| R-004 | Accepting a proposal updates the spec and stores the decision id on the section that changed. | After acceptance, the spec section cites that decision id, and the previous wording is still reachable from the decision. |
| R-005 | A decision that is later replaced stays in the list and is marked replaced, with a link to the decision that replaced it. | The list shows the old decision as replaced and the new decision as current. |
| R-006 | The person can view their own decisions and the team's decisions on one list, filtered by who decided. | The list has entries from two people, and each filter shows only that person's decisions. |
| R-007 | A coding agent may change product code only from a spec the person has accepted. The change cites the spec section it followed. | A code change without an accepted spec is refused. A change made after acceptance includes the spec id. |
| R-008 | For a brownfield start, a spec proposed from existing code is a draft. It becomes the spec only when the person accepts it, and that acceptance is the first decision. | Before acceptance the spec is labeled draft. After acceptance it is current and the decision exists. |
| R-009 | A bug start stores what happened and what the person expected. That pair is the spec the fix must follow. | The bug page shows both statements, and the code change cites that spec. |
| R-010 | QA scenarios are written from the accepted spec, in plain language a non-technical person can read. | Each scenario cites the spec section it checks. A person can read it without seeing a test framework. |
| R-011 | A QA result records pass or fail for one scenario on one build, and a failure includes what was observed. | The scenario page shows the latest result, the build id, and the observed text when it failed. |
| R-012 | A release is a named set of features and bug fixes. The person can see what is in a particular release. | Opening Release 1 lists each included feature and fix, and omits work that was not included. |
| R-013 | Release notes are generated from the release records, in the person's language, and include the decisions that changed behavior. | Generated notes mention each included item and the decision id that authorized it. They are not a dump of commit messages. |
| R-014 | The person can generate a release when every required scenario for the included items has a passing result. If a required scenario failed, generation is allowed only after a decision that accepts that failure. | With a failing required scenario, generation is refused. After an acceptance decision, generation succeeds and the release cites that decision. |
| R-015 | The person can create a role-specific agent with a name, one job, a durable description, the tools it may use, and an approval boundary. | The saved agent shows those fields, and a second task uses the same description without the person pasting it again. |
| R-016 | A role agent runs on its own after the person gives it a task. It continues through multiple steps until the task is done or it reaches the approval boundary. | A task that needs three tool steps completes without the person sending a message between the steps. A step outside the boundary stops and shows the proposed action and its inputs. |
| R-017 | While an agent is running, the person can see what it is doing and send another instruction. They can pause it and resume it. | The running task shows the current step. An added instruction is taken up. Pause stops further steps until resume. |
| R-018 | On an approval, the person can allow once, always allow a matching action, or deny. Deny stops that action. Ask-first rules win over always-allow rules when both match. | The three responses are available. A later matching action proceeds after always-allow, and still stops when an ask-first rule also matches. |
| R-019 | An agent cannot accept a spec, replace a decision, or generate a release by itself. It can propose those. The person's acceptance is stored as a decision. | An agent-only run leaves the spec in draft. The spec becomes current only after the person accepts, and that acceptance is a decision. |
| R-020 | Agent memory may keep working preferences and summaries. It is not the spec, the decision list, or the QA record. | Changing agent memory does not change the spec. The spec changes only through a decision. |

## Should have

| ID | Requirement | Acceptance signal |
|----|-------------|-------------------|
| R-030 | A role agent can hand work to another role agent. The handoff is visible in both conversations and names the task and the records involved. | The receiving agent wakes, completes the task, and both transcripts show the handoff. |
| R-031 | The person can give a role agent a routine with a schedule and an instruction. They can see the next run and the run history, and they can pause the routine. | A routine runs at the scheduled time, the history shows the run, and pause prevents the next run. |
| R-032 | A product is divided into modules. A feature or bug belongs to one or more modules. The person can see a module's specs, scenarios, and the releases that touched it. | Expenses and Billing are separate modules. A feature opened from Expenses does not appear as owned by Billing unless it was linked. |
| R-033 | A connection between two modules is its own spec, with scenarios that prove the connection. Adding a module does not rewrite the other module's accepted specs. | An integration spec cites both modules. Accepting it leaves the other specs' decision ids unchanged. |
| R-034 | Code, spec documentation, and release documentation for one outcome share one chain of ids, from intent to decision to spec to scenario to result to release to the code change. | From a line in the release notes, the person can open the decision, the spec section, the scenario, the result, and the code citation. |
| R-035 | The person can duplicate a role agent for a new scope. The copy takes the job, description, tools, and approval boundary, and does not take the original conversation. | The copy has the same description and an empty conversation. |

## Nice to have (later)

- Several role agents in one group conversation, with visible handoffs, as Grok Bot group chats do.
- Sharing an agent as a template another person can add, without sharing conversation history or credentials.
- A shared cloud computer, browser use of arbitrary sites, and a mobile client.
- Deploying a generated release to a host. v1 stops at the release record, the notes, and a git tag.

## Assumptions

- v1 is one person on one machine, with a way to label a decision as their own or the team's so the decision list still has both filters.
- The existing `sdd` engine remains the way an engineer moves a change pack. AIDLC records sit above that and publish accepted specs into git.
- "Role-specific agents" follow the Grok Bot model: one job, a durable description, an autonomous run, and an approval stop. They are not a single general helper.
- Starter roles such as spec steward, QA author, release editor, and builder are examples the person can create. The product does not ship with only those four hard-coded.

## Risks

- An agent that writes the spec and the code in one unsupervised run recreates AI-SDLC and loses the decision. R-019 is the guard.
- Treating brownfield code as the spec before acceptance lets the code drive the next change. R-008 is the guard.
- Two copies of the truth, one in agent memory and one in the spec, will drift. R-020 and R-034 are the guards.
- A release note written by hand will not match the decisions. R-013 requires generation from the release records.

---

_Promoted from greenfield change `2026-10-18-greenfield-aidlc-where-specs-and-decisions-drive-software`._
