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
