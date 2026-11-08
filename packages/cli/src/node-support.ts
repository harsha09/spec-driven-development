/**
 * The only Node.js support rule.
 *
 * Doctor fails below the minimum. Doctor warns from the minimum up to,
 * but not including, the recommended major. npm `engines.node` is the minimum.
 * The warning says that range works but isn't recommended. The test suite runs
 * on the minimum and on the recommendation. That is not long-term support.
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

/** True when doctor does not fail the runtime. A warning does not fail. */
export function isNodeVersionSupported(version: string): boolean {
  return nodeSupportLevel(version) !== "fail";
}

/** Value for every package.json `engines.node` field. */
export function nodeEnginesRange(): string {
  return `>=${MINIMUM_NODE_MAJOR}`;
}

/** One sentence for the Node 20–23 warning. Not a long-term support promise. */
export function nodeRecommendedWarning(): string {
  return `Node ${MINIMUM_NODE_MAJOR}–${RECOMMENDED_NODE_MAJOR - 1} works but isn't recommended; Node ${RECOMMENDED_NODE_MAJOR} is recommended`;
}

/** Help and other lines for this unreleased CLI. */
export function nodeRequirementPhrase(): string {
  return nodeRecommendedWarning();
}

/** Marked line for docs that still describe the released CLI 0.24.0 check. */
export function nodeNextReleaseNote(): string {
  return `Next release, not in CLI 0.24.0: ${nodeRecommendedWarning()}. Doctor warns for a major from ${MINIMUM_NODE_MAJOR} through ${RECOMMENDED_NODE_MAJOR - 1} and does not fail when the other checks pass, fails below Node ${MINIMUM_NODE_MAJOR}, and passes on Node ${RECOMMENDED_NODE_MAJOR} and newer. engines.node becomes \`${nodeEnginesRange()}\`. CI runs the test suite on Node ${MINIMUM_NODE_MAJOR} and Node ${RECOMMENDED_NODE_MAJOR}. This is not long-term support for Node ${MINIMUM_NODE_MAJOR}.`;
}

export function nodeDoctorDetail(version: string): string {
  const shown = version.startsWith("v") ? version : `v${version}`;
  const level = nodeSupportLevel(version);
  if (level === "fail") return `${shown} (FAIL: Node ${MINIMUM_NODE_MAJOR}+ required)`;
  if (level === "warn") return `${shown} (WARN: ${nodeRecommendedWarning()})`;
  return shown;
}
