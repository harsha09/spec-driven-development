/** Deterministic decider. It returns human and does not rank roles. */
export function rulesDecision(options: readonly string[]): { pick: "human" } {
  return { pick: options.includes("human") ? "human" : "human" };
}
