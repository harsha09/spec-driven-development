import { spawn } from "node:child_process";
import {
  type RoleModel,
  acceptNetwork,
  allowRole,
  createRole,
  deleteRole,
  duplicateRole,
  editRole,
  handoffRole,
  hideRole,
  pinRole,
  planNetwork,
  rebuildNetwork,
  runNetwork,
  runRole,
  setRoleMessaging,
  showRoleGroup,
  showRoles,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { withProject } from "./project.js";

function emit(result: { exitCode: number; stdout: string }): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function textArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function boolArg(value: unknown): boolean | undefined | "bad" {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return "bad";
}

function modelFromEnv(): RoleModel | undefined {
  const command = process.env.SDD_ROLE_MODEL?.trim();
  if (!command) return undefined;
  return {
    async complete(input) {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
        const out: Buffer[] = [];
        child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`role model exited ${code ?? "unknown"}`));
            return;
          }
          const text = Buffer.concat(out).toString("utf8").trim();
          try {
            const parsed = JSON.parse(text) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              reject(new Error("role model stdout is not a JSON object"));
              return;
            }
          } catch {
            reject(new Error("role model stdout is not JSON"));
            return;
          }
          resolve(text);
        });
        child.stdin?.write(`${JSON.stringify({ roleId: input.roleId, prompt: input.prompt })}\n`);
        child.stdin?.end();
      });
      return stdout;
    },
  };
}

const create = defineCommand({
  meta: { name: "create", description: "Write a new role file" },
  args: {
    name: { type: "string", description: "Role name", required: true },
    label: { type: "string", description: "Short label", required: true },
    job: { type: "string", description: "One job for this role", required: true },
    description: { type: "string", description: "Durable description" },
    "ask-first": { type: "string", description: "true or false. Default false" },
  },
  async run({ args }) {
    const ask = boolArg(args["ask-first"]);
    if (ask === "bad") process.exit(1);
    await withProject(async ({ root }) => {
      emit(
        await createRole(root, {
          name: args.name,
          label: args.label,
          job: args.job,
          description: textArg(args.description),
          askFirst: ask === true,
        }),
      );
    });
  },
});

const edit = defineCommand({
  meta: { name: "edit", description: "Update the role fields that were passed" },
  args: {
    name: { type: "positional", description: "Role name", required: true },
    label: { type: "string", description: "New label" },
    job: { type: "string", description: "New job" },
    description: { type: "string", description: "New description" },
    "ask-first": { type: "string", description: "true or false" },
  },
  async run({ args }) {
    const ask = boolArg(args["ask-first"]);
    if (ask === "bad") process.exit(1);
    await withProject(async ({ root }) => {
      emit(
        await editRole(root, args.name, {
          label: textArg(args.label),
          job: textArg(args.job),
          description: textArg(args.description),
          askFirst: typeof ask === "boolean" ? ask : undefined,
        }),
      );
    });
  },
});

function named(
  name: string,
  description: string,
  work: (root: string, role: string) => Promise<{ exitCode: number; stdout: string }>,
) {
  return defineCommand({
    meta: { name, description },
    args: {
      name: { type: "positional", description: "Role name", required: true },
    },
    async run({ args }) {
      await withProject(async ({ root }) => {
        emit(await work(root, args.name));
      });
    },
  });
}

const show = defineCommand({
  meta: { name: "show", description: "List roles, or print one role" },
  args: {
    name: { type: "positional", description: "Role name", required: false },
    all: { type: "boolean", description: "Include hidden roles", default: false },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await showRoles(root, { name: textArg(args.name), all: args.all === true }));
    });
  },
});

const run = defineCommand({
  meta: { name: "run", description: "Run a role, or stop its latest run" },
  args: {
    name: { type: "positional", description: "Role name", required: true },
    task: { type: "string", description: "What to ask the role" },
    with: { type: "string", description: "Different role that critiques an accepted section" },
    kind: { type: "string", description: "reading, code, scenario, or release" },
    section: { type: "string", description: "Section id in accepted.md" },
    change: { type: "string", description: "Change id that owns accepted.md" },
    stop: { type: "boolean", description: "Stop the latest run", default: false },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await runRole(root, {
          name: args.name,
          task: textArg(args.task),
          withRole: textArg(args.with),
          kind: textArg(args.kind),
          section: textArg(args.section),
          change: textArg(args.change),
          stop: args.stop === true,
          model: args.stop === true ? undefined : modelFromEnv(),
        }),
      );
    });
  },
});

const messagingOn = defineCommand({
  meta: { name: "on", description: "Allow roles to hand work to each other" },
  async run() {
    await withProject(async ({ root }) => {
      emit(await setRoleMessaging(root, true));
    });
  },
});

const messagingOff = defineCommand({
  meta: { name: "off", description: "Stop roles from handing work to each other" },
  async run() {
    await withProject(async ({ root }) => {
      emit(await setRoleMessaging(root, false));
    });
  },
});

const messaging = defineCommand({
  meta: { name: "messaging", description: "Turn handoff between roles on or off" },
  subCommands: { on: messagingOn, off: messagingOff },
});

const handoff = defineCommand({
  meta: { name: "handoff", description: "Hand one accepted section to another role" },
  args: {
    from: { type: "positional", description: "Role that hands off", required: true },
    to: { type: "string", description: "Role that receives the task", required: true },
    task: { type: "string", description: "What to ask the receiver" },
    change: { type: "string", description: "Change id that owns accepted.md" },
    section: { type: "string", description: "Section id in accepted.md" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await handoffRole(root, {
          from: args.from,
          to: textArg(args.to) ?? "",
          task: textArg(args.task),
          change: textArg(args.change),
          section: textArg(args.section),
          model: modelFromEnv(),
        }),
      );
    });
  },
});

const group = defineCommand({
  meta: { name: "group", description: "List accepted owners for one change" },
  args: {
    change: { type: "string", description: "Change id that owns accepted.md", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await showRoleGroup(root, textArg(args.change) ?? ""));
    });
  },
});

function networkArgs() {
  return {
    change: { type: "string" as const, description: "Change id that owns accepted.md" },
    section: { type: "string" as const, description: "Section id in accepted.md" },
    task: { type: "string" as const, description: "Task for the lead or the owners" },
  };
}

const networkAccept = defineCommand({
  meta: { name: "accept", description: "Accept a pending task-network plan" },
  args: networkArgs(),
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await acceptNetwork(root, { change: textArg(args.change), section: textArg(args.section) }),
      );
    });
  },
});

const networkRun = defineCommand({
  meta: { name: "run", description: "Run ready nodes in an accepted plan" },
  args: networkArgs(),
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await runNetwork(root, {
          change: textArg(args.change),
          section: textArg(args.section),
          model: modelFromEnv(),
        }),
      );
    });
  },
});

const networkRebuild = defineCommand({
  meta: { name: "rebuild", description: "Ask the lead for one new plan" },
  args: networkArgs(),
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await rebuildNetwork(root, {
          change: textArg(args.change),
          section: textArg(args.section),
          model: modelFromEnv(),
        }),
      );
    });
  },
});

const network = defineCommand({
  meta: { name: "network", description: "Classify a change or store a lead plan" },
  args: networkArgs(),
  subCommands: { accept: networkAccept, run: networkRun, rebuild: networkRebuild },
  async run({ args }) {
    const next = process.argv[process.argv.indexOf("network") + 1];
    if (next === "accept" || next === "run" || next === "rebuild") return;
    await withProject(async ({ root }) => {
      emit(
        await planNetwork(root, {
          change: textArg(args.change),
          section: textArg(args.section),
          task: textArg(args.task),
          model: modelFromEnv(),
        }),
      );
    });
  },
});

const allow = defineCommand({
  meta: { name: "allow", description: "Allow once, always allow, or deny a stopped run" },
  args: {
    runId: { type: "positional", description: "Run id", required: true },
    once: { type: "boolean", description: "Run the named action once", default: false },
    always: { type: "boolean", description: "Remember and run the named action", default: false },
    deny: { type: "boolean", description: "Do not run the action", default: false },
  },
  async run({ args }) {
    const selected = [args.once === true, args.always === true, args.deny === true].filter(Boolean);
    if (selected.length !== 1 || typeof args.runId !== "string") process.exit(1);
    const mode = args.once === true ? "once" : args.always === true ? "always" : "deny";
    await withProject(async ({ root }) => {
      emit(await allowRole(root, { runId: args.runId, mode }));
    });
  },
});

export const roleCmd = defineCommand({
  meta: {
    name: "role",
    description: "Create and run a product role. A role file is not a host stub.",
  },
  subCommands: {
    create,
    edit,
    pin: named("pin", "Pin a role to the top of the list", pinRole),
    hide: named("hide", "Hide a role from the default list", hideRole),
    show,
    duplicate: named("duplicate", "Copy a role profile to <name> copy", duplicateRole),
    delete: named("delete", "Delete one role, its conversation, and its memory", deleteRole),
    run,
    allow,
    messaging,
    handoff,
    group,
    network,
  },
});
