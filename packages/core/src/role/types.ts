export interface RoleLists {
  owns: string[];
  inputs: string[];
  outputs: string[];
  collaborates: string[];
  reviews: string[];
  approvers: string[];
  never: string[];
  askHumanWhen: string[];
  skills: string[];
  rules: string[];
  goals: string[];
}

export interface RoleProfile extends RoleLists {
  name: string;
  label: string;
  job: string;
  description: string;
  askFirst: boolean;
  pinned: boolean;
  hidden: boolean;
}

export function emptyRoleLists(): RoleLists {
  return {
    owns: [],
    inputs: [],
    outputs: [],
    collaborates: [],
    reviews: [],
    approvers: [],
    never: [],
    askHumanWhen: [],
    skills: [],
    rules: [],
    goals: [],
  };
}

export interface RoleModel {
  complete(input: { roleId: string; prompt: string }): Promise<string>;
}

export const WORK_TYPES = [
  "route",
  "classify",
  "check",
  "draft",
  "design",
  "code",
  "review",
] as const;

export type WorkType = (typeof WORK_TYPES)[number];

export function isWorkType(value: string): value is WorkType {
  return (WORK_TYPES as readonly string[]).includes(value);
}

/** Route, classify, and check are cheap decisions. The other work types reason. */
export function workKind(workType: WorkType): "reason" | "decide" {
  return workType === "route" || workType === "classify" || workType === "check"
    ? "decide"
    : "reason";
}

export interface DecisionModel {
  decide<T extends string>(input: {
    state: string;
    question: string;
    options: readonly T[];
  }): Promise<{ pick: T; probs: Record<T, number> }>;
}

export interface ModelChoice {
  id: string;
  kind: "reason" | "decide";
  provider: "rules" | "command" | "ollama";
  why: string;
}

export interface RoleCommandResult {
  exitCode: number;
  stdout: string;
  runId?: string;
}

export const ROLE_TEXT = {
  needsJob: "A role needs a job.",
  notFound: "Role not found.",
  exists: "Role already exists.",
  badName: "A role name is not valid.",
  self: "A role cannot review itself.",
  x: "X is not a role tool.",
  needsSection: "This needs an accepted section before a draft.",
  noModel: "No role model is configured.",
  cannot: "A role cannot do that.",
  askFirst: "Ask first. This stays stopped.",
  choice: "Allow once, Always allow, or Deny.",
  unavailable: "This action is not available in this slice.",
  expired: "Expired. The action did not run.",
  runNotFound: "Run not found.",
  badYaml: "role.yaml is invalid",
} as const;
