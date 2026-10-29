import type { RoleProfile } from "./types.js";

export interface AcceptedSection {
  id: string;
  decision: string;
  checks: string[];
  body: string;
}

export function critiquePrompt(role: RoleProfile, section: AcceptedSection, draft: string): string {
  return [
    `Job: ${role.job}`,
    "Check ids:",
    ...section.checks,
    `Cite: ${section.id}:${section.decision}`,
    "Draft:",
    draft,
  ].join("\n");
}

export function revisionPrompt(
  role: RoleProfile,
  draft: string,
  gaps: { cite: string; text: string }[],
): string {
  return [
    `Job: ${role.job}`,
    "Draft:",
    draft,
    "Gaps:",
    ...gaps.map((gap) => `${gap.cite}: ${gap.text}`),
    "changed must list every gap cite.",
  ].join("\n");
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
  const rows = [`Job: ${input.role.job}`, `Description: ${input.role.description}`];
  if (input.role.stages.length > 0) rows.push(`Stages: ${input.role.stages.join(", ")}`);
  if (input.role.owns.length > 0) rows.push(`Owns: ${input.role.owns.join(", ")}`);
  if (input.role.skills.length > 0) rows.push(`Skills: ${input.role.skills.join(", ")}`);
  if (input.role.never.length > 0) rows.push(`Never: ${input.role.never.join(", ")}`);
  if (input.role.askHumanWhen.length > 0) {
    rows.push(`Ask when: ${input.role.askHumanWhen.join(", ")}`);
  }
  if (rows.length > 2) rows.push("Stay inside this role.");
  rows.push(`Request: ${input.request}`);
  if (input.answers.length > 0) {
    rows.push("Answers:");
    for (const item of input.answers) rows.push(`- ${item.question}: ${item.answer}`);
  }
  rows.push(`Stage: ${input.stageId}`);
  if (input.summary.trim()) rows.push(`Summary: ${input.summary.trim()}`);
  if (input.instructions.trim()) rows.push(`Instructions:\n${input.instructions.trim()}`);
  rows.push(`Artifact: ${input.artifactPath}`);
  if (input.headings.length > 0) {
    rows.push("Headings:");
    for (const heading of input.headings) rows.push(`- ${heading}`);
  }
  if (input.earlier.length > 0) {
    rows.push("Earlier:");
    for (const file of input.earlier) rows.push(`## ${file.path}`, file.body.trim());
  }
  rows.push('If one fact is missing, reply with JSON {"text":"Question: ..."}');
  rows.push('Otherwise reply with JSON {"text":"...","parts":[{"heading":"...","text":"..."}]}');
  rows.push("Use only the headings listed above.");
  rows.push("Put this artifact's words under those headings.");
  rows.push("Do not rename a heading.");
  rows.push("Do not paste an earlier artifact.");
  rows.push("Do not name a module, a path, or a command result that is not in this prompt.");
  return rows.join("\n");
}
