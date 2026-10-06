/** Shared CLI flags and helpers */

export const noAgentArg = {
  type: "boolean" as const,
  description: "Do not launch the AI coding agent (or set SDD_NO_AGENT=1)",
  default: false,
};

/**
 * True when the user asked for no agent. citty (mri) parses `--no-agent` as
 * `agent: false` and leaves `args["no-agent"]` at its default, so check both.
 */
export function noAgentRequested(args: Record<string, unknown>): boolean {
  return args["no-agent"] === true || args.agent === false;
}

export function asStringList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => asStringList(v));
  }
  const s = String(value).trim();
  return s ? [s] : [];
}
