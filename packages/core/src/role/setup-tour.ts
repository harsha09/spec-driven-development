import { join } from "pathe";
import { type AgentTarget, installAgentIntegration, loadInstalledAgent } from "../agents.js";
import { isInitialized } from "../config.js";
import { listFiles } from "../fs.js";
import { initProject } from "../init.js";
import { prepareGuide } from "./guide.js";
import { modelFromEnv } from "./models/command.js";
import { loadModels } from "./models/schema.js";
import { gitUserName, initTeam } from "./team.js";
import type { RoleCommandResult } from "./types.js";

export const SETUP_STEP_IDS = [
  "folder",
  "workflow",
  "host",
  "roles",
  "model",
  "check",
  "start",
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export const SETUP_WHY: Record<SetupStepId, string> = {
  folder: "sdd reads .sdd/config.yaml first.",
  workflow: "Stage lists on new role files come from this workflow.",
  host: "A host is optional. Drafts use a role model, not the host.",
  roles: "These files say who drafts each stage. Existing files stay.",
  model: "A draft needs SDD_ROLE_MODEL. Setup does not write that command into the repo.",
  check: "This is what is already in place.",
  start: "The first change is optional. sdd go asks the role for that stage.",
};

export type SetupRolesChoice = "duties" | "software" | "keep";

export type SetupModelState = "configured" | "missing" | { error: string };

export type SetupStatus = {
  folder: boolean;
  host: string | null;
  roles: string[];
  model: SetupModelState;
};

export type SetupStepInput = {
  step: SetupStepId;
  workflow?: string;
  host?: false | AgentTarget;
  roles?: SetupRolesChoice;
  /** When the model is missing, true exits 1. False prints the sentence and exits 0. */
  requireModel?: boolean;
};

function ok(stdout: string): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

export function parseSetupStep(raw: string): SetupStepId | null {
  const id = raw.trim();
  return (SETUP_STEP_IDS as readonly string[]).includes(id) ? (id as SetupStepId) : null;
}

export function formatSetupStatus(status: SetupStatus): string {
  const folder = status.folder ? "Folder: ready." : "Folder: not set up.";
  const host = status.host ? `Host: ${status.host}.` : "Host: none.";
  const roles = status.roles.length > 0 ? `Roles: ${status.roles.join(", ")}.` : "Roles: none.";
  const model =
    status.model === "configured"
      ? "Model: configured."
      : status.model === "missing"
        ? "Model: No role model is configured."
        : `Model: ${status.model.error}`;
  return [folder, host, roles, model].join("\n");
}

async function roleNames(root: string): Promise<string[]> {
  const names = await listFiles(join(root, ".sdd", "roles"));
  return names
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length))
    .sort((left, right) => left.localeCompare(right));
}

async function modelState(
  root: string,
  env: Record<string, string | undefined>,
): Promise<SetupModelState> {
  if (modelFromEnv(env)) return "configured";
  const loaded = await loadModels(root);
  if (loaded === null) return "missing";
  if ("error" in loaded) return { error: loaded.error };
  return "configured";
}

export async function readSetupStatus(
  root: string,
  env: Record<string, string | undefined> = process.env,
): Promise<SetupStatus> {
  const installed = await loadInstalledAgent(root);
  return {
    folder: await isInitialized(root),
    host: installed?.ai ?? null,
    roles: await roleNames(root),
    model: await modelState(root, env),
  };
}

function withRoleHints(result: RoleCommandResult): RoleCommandResult {
  if (result.exitCode !== 0) return result;
  const hints = [
    "Add stages with sdd role edit <name> --stages ...",
    'Add context with sdd role context <name> --text "..."',
  ];
  const body = result.stdout.trim();
  return ok(body.length > 0 ? `${body}\n${hints.join("\n")}` : hints.join("\n"));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runSetupStep(
  root: string,
  input: SetupStepInput,
  env: Record<string, string | undefined> = process.env,
): Promise<RoleCommandResult> {
  const workflow = input.workflow?.trim() || "feature";
  try {
    if (input.step === "folder") {
      if (!(await isInitialized(root))) {
        await initProject({ projectRoot: root, agents: false });
      }
      return ok("Folder: ready.");
    }

    if (input.step === "workflow") {
      const lines = [`Workflow: ${workflow}.`];
      if ((await roleNames(root)).length > 0) lines.push("Roles are already here.");
      return ok(lines.join("\n"));
    }

    if (input.step === "host") {
      const installed = await loadInstalledAgent(root);
      if (installed) return ok(`Host: ${installed.ai}.`);
      if (!input.host) return ok("Host: none.");
      if (!(await isInitialized(root))) {
        await initProject({ projectRoot: root, agents: input.host });
      } else {
        await installAgentIntegration({ projectRoot: root, target: input.host });
      }
      const after = await loadInstalledAgent(root);
      return ok(`Host: ${after?.ai ?? input.host}.`);
    }

    if (input.step === "roles") {
      const choice = input.roles ?? "duties";
      if (choice === "keep") {
        const names = await roleNames(root);
        const line = names.length > 0 ? "Roles are already here." : "Roles: none.";
        return withRoleHints(ok(line));
      }
      if (choice === "software") {
        return withRoleHints(await initTeam(root, "software", gitUserName(root)));
      }
      return withRoleHints(await prepareGuide(root, { workflow, agents: false }));
    }

    if (input.step === "model") {
      const state = await modelState(root, env);
      if (state === "configured") return ok("Model: configured.");
      if (typeof state === "object") return fail(state.error);
      if (input.requireModel) return fail("No role model is configured.");
      return ok("No role model is configured.");
    }

    if (input.step === "check") {
      return ok(formatSetupStatus(await readSetupStatus(root, env)));
    }

    return ok('Next: sdd go "what you want to build"');
  } catch (error) {
    return fail(messageOf(error));
  }
}
