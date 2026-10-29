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
