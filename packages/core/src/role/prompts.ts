import {
  PROMPT_TEXT,
  type PromptInputBlock,
  type RoleCard,
  buildPrompt,
  renderReplyContract,
  roleCard,
  roleLines,
  scopeLines,
} from "../prompt.js";
import {
  DRAFT_REPLY_EXAMPLES,
  DraftContractSchema,
  GUIDE_REPLY_EXAMPLES,
  GuideReplySchema,
  PLAN_REPLY_EXAMPLES,
  PlanReplySchema,
  ROOM_POST_EXAMPLES,
  RevisionReplySchema,
  RoomPostSchema,
  critiqueExamples,
  critiqueReplySchema,
  revisionExamples,
} from "../reply-schemas.js";
import type { RoleProfile } from "./types.js";

export interface AcceptedSection {
  id: string;
  decision: string;
  checks: string[];
  body: string;
}

/**
 * Wording for every prompt except the loop (see team/brain.ts and team/loop-contract.ts).
 * Each function builds a PromptSpec for `buildPrompt`; the shared sections, order, and default
 * guardrails and style live in prompt.ts.
 */

function who(role: RoleProfile): { role: string[]; scope: string[]; card: RoleCard } {
  const card = roleCard(role);
  return { role: roleLines(card), scope: scopeLines(card), card };
}

/** The contract for `{text, action?}` replies: author, hand-off receiver, and network owner. */
const DRAFT = (rules: string[] = []): string =>
  renderReplyContract(DraftContractSchema, { rules, examples: DRAFT_REPLY_EXAMPLES });

const WRITE_ONLY = "Write only through the write_file action. No other action name is allowed.";

/** The ids a critic may cite: the section's check ids, then `<section id>:<decision>`. */
export function citeIds(section: AcceptedSection): [string, ...string[]] {
  const own = `${section.id}:${section.decision}`;
  const ids = [...section.checks, own];
  return [ids[0] ?? own, ...ids.slice(1)];
}

export function critiquePrompt(role: RoleProfile, section: AcceptedSection, draft: string): string {
  const me = who(role);
  const cites = citeIds(section);
  return buildPrompt({
    role: me.role,
    scope: [...me.scope, "You review. You do not rewrite the draft."],
    task: [
      "Review the draft against the checks.",
      "1. For each check id in Cite ids, decide if the draft meets it.",
      "2. Report a gap only when the draft misses a check or breaks a rule.",
      "3. Cite exactly one id for each gap. Use an id from Cite ids.",
      "4. Say each gap in one short sentence. Say what is missing, not how to fix it.",
      "5. If the draft meets every check, return an empty gaps list.",
      "Done when: every check id was considered, and each gap has a valid cite.",
    ],
    inputs: [
      {
        label: "Section",
        source: "the accepted spec",
        text: `${section.id} / ${section.decision}`,
      },
      { label: "Cite ids", source: "the accepted spec", text: cites.join("\n") },
      { label: "Draft", source: "the author role", text: draft },
    ],
    guardrails: [
      "Do not invent an id. A cite outside Cite ids is refused.",
      "Use the last id, the section and decision, only for a gap that fits no check id.",
      "Quote the exact text each gap is about.",
      "Report only real gaps. If the draft meets every check, reply with an empty list.",
      "Do not praise the draft. Do not list style tips. Do not report a gap twice.",
    ],
    output: renderReplyContract(critiqueReplySchema(cites), {
      rules: ["List every gap in gaps. An empty list means the draft meets every check."],
      examples: critiqueExamples(cites),
    }),
  });
}

export function revisionPrompt(
  role: RoleProfile,
  draft: string,
  gaps: { cite: string; text: string }[],
): string {
  const me = who(role);
  const cites = [...new Set(gaps.map((gap) => gap.cite))];
  return buildPrompt({
    role: me.role,
    scope: [...me.scope, "You fix gaps. You change nothing else."],
    task: [
      "Revise the draft so that every gap is fixed.",
      "1. Fix each gap with the smallest change.",
      "2. Keep every part of the draft that has no gap.",
      "3. In changed, list the cite of every gap you fixed.",
      "4. If you cannot fix a gap, list its cite in open. Do not claim a fix you did not make.",
      "5. In text, write the full revised draft, not only the changed parts.",
      "Done when: changed and open together list every gap cite once, and text is the full draft.",
    ],
    inputs: [
      { label: "Draft", source: "you, earlier in this run", text: draft },
      {
        label: "Gaps",
        source: "the critic role",
        text: gaps.map((gap) => `${gap.cite}: ${gap.text}`).join("\n"),
      },
    ],
    guardrails: [
      "changed and open together must list every gap cite, each once.",
      "Keep the draft's wording wherever no gap applies.",
      "Do not add content that no gap asked for.",
    ],
    output: renderReplyContract(RevisionReplySchema, {
      rules: ["Put the full revised draft in text."],
      examples: revisionExamples(cites),
    }),
  });
}

export function authorPrompt(input: {
  role: RoleProfile;
  task: string;
  kind: string;
  section?: AcceptedSection;
  context?: string;
  guide?: boolean;
}): string {
  const me = who(input.role);
  const task = [input.task, `Kind: ${input.kind}`];
  const steps = [
    "1. Read the task and the Inputs.",
    "2. Do only what the task asks.",
    "3. Put your answer in text, in a few short sentences.",
    "4. If a file must be written, add one write_file action. A person approves it.",
    "Done when: the task is answered, or you named the one fact you need.",
  ];
  const inputs: PromptInputBlock[] = [
    { label: "Context", source: "the role context file", text: input.context ?? "" },
  ];
  if (input.section) {
    task.push(`Section: ${input.section.id}`, `Decision: ${input.section.decision}`);
    task.push("Check ids:", ...input.section.checks);
    inputs.push({
      label: "Section text",
      source: "the accepted-decisions file",
      text: input.section.body,
    });
  }
  return buildPrompt({
    role: me.role,
    scope: me.scope,
    task: [...task, ...steps],
    inputs,
    guardrails: [WRITE_ONLY],
    output: DRAFT(
      input.guide
        ? [
            'If one fact is missing, set text to one line that starts with "Question: ".',
            "Otherwise put the draft for this stage in text.",
          ]
        : [],
    ),
  });
}

/** The review room prompt (`reviewRoom` in team/room.ts). Its own spec: no critique or revision text. */
export function roomPrompt(input: {
  role: RoleProfile;
  stageId: string;
  round: number;
  cap: number;
  /** True when this role owns the stage's artifact. */
  owner: boolean;
  draft: string;
  entries: string[];
  /** Open objections from the last round. Only the owner is shown them. */
  open?: { cite: string; text: string }[];
  /** The stage has verify commands, so an agree needs an evidence path. */
  verify?: boolean;
  /** The evidence path for the current commit, when a passing check run exists. */
  evidence?: string | null;
}): string {
  const me = who(input.role);
  const open = input.owner ? (input.open ?? []) : [];
  const answering = input.owner && open.length > 0;
  const inputs: PromptInputBlock[] = [
    { label: "Draft", source: "the stage artifact", text: input.draft || "(none)" },
    { label: "Room so far", source: "the room log", text: input.entries.join("\n") || "(empty)" },
  ];
  if (answering) {
    inputs.push({
      label: "Open objections",
      source: "the room log",
      text: open.map((gap) => `${gap.cite}: ${gap.text}`).join("\n"),
    });
  }
  if (input.verify) {
    inputs.push({
      label: "Evidence path",
      source: "the latest check run",
      text: input.evidence || "none",
    });
  }
  return buildPrompt({
    role: me.role,
    scope: [
      ...me.scope,
      `You are in a review room for stage \`${input.stageId}\`. Other roles speak here too. Round ${input.round} of ${input.cap}.`,
      input.owner
        ? "You own this stage's artifact."
        : "You review. You do not own this stage's artifact.",
    ],
    task: [
      "Post one entry in the room.",
      "1. Read the draft and the room so far.",
      answering
        ? "2. Answer the open objections. Say in one line how you fixed each, or use block if you cannot."
        : "2. Decide what the draft needs.",
      "3. Choose one type:",
      "   - post: a note or an answer.",
      "   - objection: the draft misses a check or breaks a rule. Cite what it breaks.",
      "   - agree: you accept the draft as it is.",
      "   - block: you cannot go on until the person decides.",
      "4. Write the entry in one line.",
      "Done when: you posted exactly one entry that follows the contract.",
    ],
    inputs,
    guardrails: [
      "An objection needs a cite: the check id, section or file it is about.",
      input.verify
        ? "Use agree only with the evidence path from this commit in cite."
        : "Use agree only if every check is met.",
      "Do not write pass, works or fixed unless you cite the evidence path.",
      "Do not use the type decision. Only the person records a decision.",
      "Agree only with a point you checked.",
      "Write one line. Do not repeat an earlier room entry.",
    ],
    style: ["Write text as one line. No line breaks.", ...PROMPT_TEXT.style],
    output: renderReplyContract(RoomPostSchema, { examples: ROOM_POST_EXAMPLES }),
  });
}

export function guideDraftPrompt(input: {
  role: RoleProfile;
  request: string;
  answers: { question: string; answer: string }[];
  stageId: string;
  summary: string;
  instructions: string;
  artifactPath: string;
  headings: string[];
  earlier: { path: string; body: string }[];
}): string {
  const me = who(input.role);
  const task = [`Stage: ${input.stageId}`];
  if (input.summary.trim()) task.push(`Summary: ${input.summary.trim()}`);
  if (input.instructions.trim()) task.push(`Instructions:\n${input.instructions.trim()}`);
  task.push(`Artifact: ${input.artifactPath}`);
  const rules = [
    'If one fact is missing, set text to "Question: ..." and leave parts out.',
    "Otherwise put the whole draft in text and split it into parts, one entry per heading.",
  ];
  if (input.headings.length > 0) {
    rules.push("Use only these headings, spelled exactly:", ...input.headings.map((h) => `- ${h}`));
  }
  const inputs: PromptInputBlock[] = [
    { label: "Request", source: "the person", text: input.request },
    {
      label: "Answers",
      source: "the person",
      text: input.answers.map((item) => `- ${item.question}: ${item.answer}`).join("\n"),
    },
    ...input.earlier.map((file) => ({
      label: `Earlier artifact ${file.path}`,
      source: "the change folder",
      text: file.body,
    })),
  ];
  return buildPrompt({
    role: me.role,
    scope: me.scope,
    task,
    inputs,
    guardrails: [
      "Put this artifact's words under those headings. Do not rename a heading.",
      "Do not paste an earlier artifact.",
      "Do not name a module, a path, or a command result that is not in this prompt.",
    ],
    output: renderReplyContract(GuideReplySchema, { rules, examples: GUIDE_REPLY_EXAMPLES }),
  });
}

export function receiverPrompt(
  role: RoleProfile,
  task: string,
  section: { id: string; decision: string; body: string },
): string {
  const me = who(role);
  return buildPrompt({
    role: me.role,
    scope: [
      ...me.scope,
      "You received this work from another role. You are the only owner of this section.",
    ],
    task: [
      `Do the task for section ${section.id}, decision ${section.decision}.`,
      `Task: ${task}`,
      "Kind: handoff",
      "1. Read the section text.",
      "2. Do only what the task asks.",
      "3. In text, say what you did or what you need, in a few short sentences.",
      "4. If a file must be written, add one write_file action with a one-line reason. A person approves it.",
      "Done when: the task is answered, or you named the one fact you need.",
    ],
    inputs: [{ label: "Section text", source: "the accepted-decisions file", text: section.body }],
    guardrails: [
      "Answer only for this section.",
      "Do not accept a spec. Do not record a decision. Do not hand the work to anyone else.",
      WRITE_ONLY,
    ],
    output: DRAFT(["Put what you will do for this section in text."]),
  });
}

export function leadPrompt(input: {
  lead: RoleProfile;
  task: string;
  services: { service: string; module: string; owner: string; decision: string }[];
  owners: string[];
}): string {
  const me = who(input.lead);
  return buildPrompt({
    role: me.role,
    scope: [...me.scope, "You plan who does what. You write no artifact yourself."],
    task: [
      "Make a plan for the task. Split it into pieces. Give each piece one owner.",
      "1. Make one node for each piece. scope is a service or module id from Services.",
      "2. owner is a role name from Owners. decision is a decision id from Services.",
      "3. Use each decision id once.",
      "4. after lists the decision ids that must finish first. Use [] if none.",
      "5. artifact is the path of the file the owner will write. It must be a relative path inside the project.",
      '6. boundary is "ask" or "stop". It says what the owner does at the edge of the artifact.',
      '   Use "ask" when the owner may need to ask the person one question before going on.',
      '   Use "stop" when the owner should stop and report what change is needed and where.',
      "7. Put a node under children only to split it once. Never go deeper than one level of children.",
      "Done when: every service has an owner, and no decision id is used twice.",
    ],
    inputs: [
      { label: "Task", source: "the person", text: input.task },
      {
        label: "Services",
        source: "the accepted-decisions file",
        text: input.services
          .map((s) => `${s.service} module ${s.module} owner ${s.owner} decision ${s.decision}`)
          .join("\n"),
      },
      { label: "Owners", source: "the team roles", text: input.owners.join("\n") },
    ],
    guardrails: [
      "Do not use a scope, owner, or decision id that is not listed in Inputs.",
      "Do not give one piece to two owners. Each artifact has exactly one owner.",
      "List an artifact before anything that depends on it.",
    ],
    output: renderReplyContract(PlanReplySchema, {
      rules: [
        "A plan is at most two levels deep: a node may have children, a child may not.",
        "Every artifact path is relative and inside the project.",
      ],
      examples: PLAN_REPLY_EXAMPLES,
    }),
  });
}

export function ownerRunPrompt(input: {
  owner: RoleProfile;
  task: string;
  artifact: string;
  boundary: string;
  /** Summaries of the nodes this one comes after, and of its children. */
  prior?: { decision: string; summary: string }[];
  /** Answers the person gave to this node's earlier questions. */
  answers?: { question: string; answer: string }[];
}): string {
  const me = who(input.owner);
  const inputs: PromptInputBlock[] = [];
  if (input.prior && input.prior.length > 0) {
    inputs.push({
      label: "Prior results",
      source: "the nodes that finished before this one",
      text: input.prior.map((item) => `${item.decision}: ${item.summary}`).join("\n"),
    });
  }
  if (input.answers && input.answers.length > 0) {
    inputs.push({
      label: "Answers",
      source: "the person",
      text: input.answers.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n"),
    });
  }
  return buildPrompt({
    role: me.role,
    scope: [...me.scope, "You received this work from the lead. You own one artifact."],
    task: [
      input.task,
      `Write the artifact ${input.artifact}.`,
      `Boundary: ${input.boundary}`,
      "1. Do only the work for this artifact.",
      "2. Put what you did in text, in a few short sentences.",
      "3. If a file must be written, add one write_file action for the artifact. A person approves it.",
      "4. If the work needs a change outside the artifact, follow Boundary.",
      "Done when: every check for this artifact passes, or you followed Boundary.",
    ],
    inputs,
    guardrails: [
      "Work only on this artifact.",
      'If Boundary is ask and you need an answer from the person, set text to one line that starts with "Question: ". Add no action. The run waits for the answer.',
      "If Boundary is stop, stop and say in text what change is needed and where. Add no action.",
      WRITE_ONLY,
    ],
    output: DRAFT(["Put what you did for the artifact in text."]),
  });
}
