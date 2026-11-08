/**
 * The only Node.js support rule.
 *
 * Doctor fails below the minimum. Doctor warns from the minimum up to,
 * but not including, the recommended major. npm `engines.node` is the minimum.
 * Node 24 is recommended because Node 20 is past upstream end of life
 * (Node.js release schedule: Iron ended 2026-04-30).
 */
export const MINIMUM_NODE_MAJOR = 20;
export const RECOMMENDED_NODE_MAJOR = 24;

export type NodeSupportLevel = "fail" | "warn" | "pass";

export function nodeMajor(version: string): number | null {
  const major = Number(version.match(/^v?(\d+)/)?.[1]);
  return Number.isInteger(major) ? major : null;
}

export function nodeSupportLevel(version: string): NodeSupportLevel {
  const major = nodeMajor(version);
  if (major === null || major < MINIMUM_NODE_MAJOR) return "fail";
  if (major < RECOMMENDED_NODE_MAJOR) return "warn";
  return "pass";
}

/** True when doctor does not fail the runtime. A warning still counts as supported. */
export function isNodeVersionSupported(version: string): boolean {
  return nodeSupportLevel(version) !== "fail";
}

/** Value for every package.json `engines.node` field. */
export function nodeEnginesRange(): string {
  return `>=${MINIMUM_NODE_MAJOR}`;
}

/** One sentence for the Node 20–23 warning. */
export function nodeRecommendedWarning(): string {
  return `Node ${RECOMMENDED_NODE_MAJOR} recommended because Node ${MINIMUM_NODE_MAJOR} is past upstream end of life`;
}

/** README, help, and other requirement lines. */
export function nodeRequirementPhrase(): string {
  return `Node ${MINIMUM_NODE_MAJOR}+ (${nodeRecommendedWarning()})`;
}

export function nodeDoctorDetail(version: string): string {
  const shown = version.startsWith("v") ? version : `v${version}`;
  const level = nodeSupportLevel(version);
  if (level === "fail") return `${shown} (FAIL: Node ${MINIMUM_NODE_MAJOR}+ required)`;
  if (level === "warn") return `${shown} (WARN: ${nodeRecommendedWarning()})`;
  return shown;
}
