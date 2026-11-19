import { type PromptInputBlock, buildPrompt, renderReplyContract } from "../prompt.js";
import {
  GUIDE_REPLY_EXAMPLE,
  GuideReplySchema,
  MODEL_REPLY_EXAMPLE,
  ModelReplySchema,
  PLAN_REPLY_EXAMPLE,
  PlanReplySchema,
  ROOM_POST_EXAMPLE,
  RoomPostSchema,
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

function roleLines(role: RoleProfile): string[] {
  const rows = [`Job: ${role.job}`];
  if (role.description.trim()) rows.push(`Description: ${role.description.trim()}`);
  if (role.skills.length > 0) rows.push(`Skills: ${role.skills.join(", ")}`);
  return rows;
}

function scopeLines(role: RoleProfile): string[] {
  const rows: string[] = [];
  if (role.stages.length > 0) rows.push(`Stages: ${role.stages.join(", ")}`);
  if (role.owns.length > 0) rows.push(`Owns: ${role.owns.join(", ")}`);
  if (role.never.length > 0) rows.push(`Never: ${role.never.join(", ")}`);
  if (role.askHumanWhen.length > 0)
    rows.push(`Ask a person first when: ${role.askHumanWhen.join(", ")}`);
  return rows;
}

function stayInRole(role: RoleProfile): string[] {
  return scopeLines(role).length > 0 ? ["Stay inside this role."] : [];
}

function checkLines(section: AcceptedSection): string[] {
  return [
    "Check ids:",
    ...section.checks,
    `Cite for a gap that fits no check id: ${section.id}:${section.decision}`,
  ];
}

const REPLY = (rules: string[] = []): string =>
  renderReplyContract(ModelReplySchema, { rules, example: MODEL_REPLY_EXAMPLE });

export function critiquePrompt(role: RoleProfile, section: AcceptedSection, draft: string): string {
  return buildPrompt({
    role: roleLines(role),
    scope: scopeLines(role),
    task: [
      "Review the draft against the check ids. Report each gap with the check id it breaks.",
      ...checkLines(section),
    ],
    inputs: [{ label: "Draft", text: draft }],
    output: REPLY([
      "List every gap in gaps. Leave gaps out when the draft has none.",
      "Do not set changed.",
    ]),
    guardrails: ["Every gap needs a cite from Task.", ...stayInRole(role)],
  });
}

export function revisionPrompt(
  role: RoleProfile,
  draft: string,
  gaps: { cite: string; text: string }[],
): string {
  return buildPrompt({
    role: roleLines(role),
    scope: scopeLines(role),
    task: ["Revise the draft so every gap is fixed. Change nothing else."],
    inputs: [
      { label: "Draft", text: draft },
      { label: "Gaps", text: gaps.map((gap) => `${gap.cite}: ${gap.text}`).join("\n") },
    ],
    output: REPLY(["Put the revised draft in text. List the cite of every fixed gap in changed."]),
    guardrails: ["changed must list every gap cite.", ...stayInRole(role)],
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
  const task = [input.task, `Kind: ${input.kind}`];
  const inputs: PromptInputBlock[] = [{ label: "Context", text: input.context ?? "" }];
  if (input.section) {
    task.push(`Section: ${input.section.id}`, `Decision: ${input.section.decision}`);
    task.push("Check ids:", ...input.section.checks);
    inputs.push({ label: "Section text", text: input.section.body });
  }
  return buildPrompt({
    role: roleLines(input.role),
    scope: scopeLines(input.role),
    task,
    inputs,
    output: REPLY(
      input.guide
        ? [
            'If one fact is missing, set text to one line that starts with "Question: ".',
            "Otherwise put the draft for this stage in text.",
          ]
        : [],
    ),
    guardrails: stayInRole(input.role),
  });
}

export function roomPrompt(input: {
  role: RoleProfile;
  section: AcceptedSection;
  draft: string;
  entries: string[];
  /** Set when this role owns the draft and objections are still open. */
  open?: { cite: string; text: string }[];
}): string {
  const owner = input.open !== undefined && input.open.length > 0;
  const inputs: PromptInputBlock[] = [
    { label: "Draft", text: input.draft },
    { label: "Room", text: input.entries.join("\n") },
  ];
  if (owner) {
    inputs.push({
      label: "Open objections",
      text: (input.open ?? []).map((gap) => `${gap.cite}: ${gap.text}`).join("\n"),
    });
  }
  return buildPrompt({
    role: roleLines(input.role),
    scope: scopeLines(input.role),
    task: [
      owner
        ? "Post one entry to the room. You own this draft: answer the open objections."
        : "Post one entry to the room about the draft. Object, agree, or add a point.",
      ...checkLines(input.section),
    ],
    inputs,
    output: renderReplyContract(RoomPostSchema, {
      rules: ["An objection needs a cite."],
      example: ROOM_POST_EXAMPLE,
    }),
    guardrails: ["Write one line. Do not repeat an earlier room entry.", ...stayInRole(input.role)],
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
  const task = [`Request: ${input.request}`, `Stage: ${input.stageId}`];
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
    {
      label: "Answers",
      text: input.answers.map((item) => `- ${item.question}: ${item.answer}`).join("\n"),
    },
    ...input.earlier.map((file) => ({ label: `Earlier artifact ${file.path}`, text: file.body })),
  ];
  return buildPrompt({
    role: roleLines(input.role),
    scope: scopeLines(input.role),
    task,
    inputs,
    output: renderReplyContract(GuideReplySchema, { rules, example: GUIDE_REPLY_EXAMPLE }),
    guardrails: [
      "Put this artifact's words under those headings. Do not rename a heading.",
      "Do not paste an earlier artifact.",
      "Do not name a module, a path, or a command result that is not in this prompt.",
      ...stayInRole(input.role),
    ],
  });
}

export function receiverPrompt(
  role: RoleProfile,
  task: string,
  section: { id: string; decision: string; body: string },
): string {
  return buildPrompt({
    role: roleLines(role),
    scope: scopeLines(role),
    task: [task, "Kind: handoff", `Section: ${section.id}`, `Decision: ${section.decision}`],
    inputs: [{ label: "Section text", text: section.body }],
    output: REPLY(["Put what you will do for this section in text."]),
    guardrails: ["Answer only for this section.", ...stayInRole(role)],
  });
}

export function leadPrompt(input: {
  lead: RoleProfile;
  task: string;
  services: { service: string; module: string; owner: string; decision: string }[];
}): string {
  return buildPrompt({
    role: roleLines(input.lead),
    scope: scopeLines(input.lead),
    task: [
      input.task,
      "Split the task into a plan. Name who writes which artifact, and in what order.",
    ],
    inputs: [
      {
        label: "Services",
        text: input.services
          .map((s) => `${s.service} module ${s.module} owner ${s.owner} decision ${s.decision}`)
          .join("\n"),
      },
    ],
    output: renderReplyContract(PlanReplySchema, {
      rules: [
        "A plan is at most two levels deep: a node may have children, a child may not.",
        "Every artifact path is relative and inside the project.",
      ],
      example: PLAN_REPLY_EXAMPLE,
    }),
    guardrails: [
      "Use only services, modules, owners, and decisions listed in Inputs.",
      ...stayInRole(input.lead),
    ],
  });
}

export function ownerRunPrompt(input: {
  owner: RoleProfile;
  task: string;
  artifact: string;
  boundary: string;
}): string {
  return buildPrompt({
    role: roleLines(input.owner),
    scope: scopeLines(input.owner),
    task: [input.task, `Artifact: ${input.artifact}`, `Boundary: ${input.boundary}`],
    output: REPLY(["Put what you did for the artifact in text."]),
    guardrails: [
      "Work on this artifact only. Boundary says what to do at its edge: ask or stop.",
      ...stayInRole(input.owner),
    ],
  });
}
