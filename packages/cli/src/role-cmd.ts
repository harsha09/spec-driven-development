import {
  acceptNetwork,
  addLesson,
  allowRole,
  createRole,
  createRoleFromTemplate,
  deleteRole,
  duplicateRole,
  editRole,
  handoffRole,
  hideRole,
  modelFromEnv,
  pinRole,
  planNetwork,
  postRoom,
  queueRole,
  rebuildNetwork,
  recordDecisionRequest,
  reviewRoom,
  routeRole,
  runNetwork,
  runRole,
  setRoleContext,
  setRoleMessaging,
  showMemory,
  showRoleGroup,
  showRoles,
  showRoom,
  spawnModelCommand,
  takeRole,
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

function stageList(value: unknown): string[] | undefined | "bad" {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return "bad";
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (parts.length === 0) return "bad";
  return parts;
}

function boolArg(value: unknown): boolean | undefined | "bad" {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return "bad";
}

const create = defineCommand({
  meta: { name: "create", description: "Write a new role file" },
  args: {
    roleName: { type: "positional", description: "Role name", required: false },
    name: { type: "string", description: "Role name", required: false },
    label: { type: "string", description: "Short label" },
    job: { type: "string", description: "One job for this role" },
    description: { type: "string", description: "Durable description" },
    template: { type: "string", description: "Shipped role template, such as software/developer" },
    stages: {
      type: "string",
      description: "Comma-separated stage ids of the workflow this role follows",
    },
    "ask-first": { type: "string", description: "true or false. Default false" },
  },
  async run({ args }) {
    const ask = boolArg(args["ask-first"]);
    if (ask === "bad") process.exit(1);
    const stages = stageList(args.stages);
    if (stages === "bad") {
      process.stdout.write("A stage list is not valid.\n");
      process.exit(1);
    }
    const positional = textArg(args.roleName);
    const flagged = textArg(args.name);
    if (positional && flagged && positional !== flagged) {
      process.stdout.write("A role name is not valid.\n");
      process.exit(1);
    }
    const name = flagged || positional || "";
    await withProject(async ({ root }) => {
      const template = textArg(args.template);
      if (template) {
        const created = await createRoleFromTemplate(root, {
          name,
          template,
          label: textArg(args.label),
          job: textArg(args.job),
          description: textArg(args.description),
        });
        if (created.exitCode !== 0 || !stages) {
          emit(created);
          return;
        }
        emit(await editRole(root, name, { stages }));
        return;
      }
      if (!textArg(args.label)) {
        process.stdout.write("A role needs a label.\n");
        process.exit(1);
      }
      emit(
        await createRole(root, {
          name,
          label: textArg(args.label) ?? "",
          job: textArg(args.job) ?? "",
          description: textArg(args.description),
          askFirst: ask === true,
          stages,
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
    stages: {
      type: "string",
      description: "Comma-separated stage ids of the workflow this role follows",
    },
    "ask-first": { type: "string", description: "true or false" },
  },
  async run({ args }) {
    const ask = boolArg(args["ask-first"]);
    if (ask === "bad") process.exit(1);
    const stages = stageList(args.stages);
    if (stages === "bad") {
      process.stdout.write("A stage list is not valid.\n");
      process.exit(1);
    }
    await withProject(async ({ root }) => {
      emit(
        await editRole(root, args.name, {
          label: textArg(args.label),
          job: textArg(args.job),
          description: textArg(args.description),
          askFirst: typeof ask === "boolean" ? ask : undefined,
          stages,
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

const context = defineCommand({
  meta: { name: "context", description: "Show, provide, or generate context for one role" },
  args: {
    name: { type: "positional", description: "Role name", required: true },
    text: { type: "string", description: "Context the developer provides" },
    knowledge: {
      type: "string",
      description: "Optional knowledge kept when this role generates context",
    },
    generate: {
      type: "boolean",
      description: "Build context from the repo, the role name, and any knowledge",
      default: false,
    },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await setRoleContext(root, {
          name: args.name,
          text: textArg(args.text),
          knowledge: textArg(args.knowledge),
          generate: args.generate === true,
        }),
      );
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
          model: args.stop === true ? undefined : modelFromEnv(process.env),
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
          model: modelFromEnv(process.env),
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
          model: modelFromEnv(process.env),
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
          model: modelFromEnv(process.env),
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
          model: modelFromEnv(process.env),
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

function routeArgs() {
  return {
    stage: { type: "string" as const, description: "Stage id" },
    artifact: { type: "string" as const, description: "Artifact path or owns phrase" },
    skill: { type: "string" as const, description: "Skill the item needs" },
    id: { type: "string" as const, description: "Item id" },
  };
}

const route = defineCommand({
  meta: { name: "route", description: "Route one item to the role that owns it" },
  args: {
    ...routeArgs(),
    bot: { type: "string" as const, description: "Bot name for a model override" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await routeRole(
          root,
          {
            stage: textArg(args.stage),
            artifact: textArg(args.artifact),
            skill: textArg(args.skill),
            id: textArg(args.id),
            bot: textArg(args.bot),
          },
          {
            env: process.env,
            fetch: globalThis.fetch,
            runCommand: spawnModelCommand,
            now: () => new Date(),
          },
        ),
      );
    });
  },
});

const queue = defineCommand({
  meta: { name: "queue", description: "Show bot inboxes" },
  args: {
    bot: { type: "positional", description: "Bot name", required: false },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await queueRole(root, textArg(args.bot)));
    });
  },
});

const decide = defineCommand({
  meta: { name: "decide", description: "Append an unsigned decision request" },
  args: {
    note: { type: "string", description: "The decision to ask", required: true },
    change: { type: "string", description: "Change id" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await recordDecisionRequest(root, {
          note: textArg(args.note),
          change: textArg(args.change),
        }),
      );
    });
  },
});

const take = defineCommand({
  meta: { name: "take", description: "Give one item to a bot that has room" },
  args: {
    bot: { type: "positional", description: "Bot name", required: false },
    ...routeArgs(),
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await takeRole(root, {
          bot: textArg(args.bot),
          stage: textArg(args.stage),
          artifact: textArg(args.artifact),
          skill: textArg(args.skill),
          id: textArg(args.id),
        }),
      );
    });
  },
});

const memory = defineCommand({
  meta: { name: "memory", description: "Print a bot's memory" },
  args: {
    bot: { type: "positional", description: "Bot name", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await showMemory(root, args.bot));
    });
  },
});

const lessonAdd = defineCommand({
  meta: { name: "add", description: "Append a lesson a person wrote" },
  args: {
    bot: { type: "positional", description: "Bot name", required: true },
    text: { type: "positional", description: "Lesson text", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await addLesson(root, args.bot, args.text));
    });
  },
});

const lesson = defineCommand({
  meta: { name: "lesson", description: "Record a lesson a person wrote" },
  subCommands: { add: lessonAdd },
});

const room = defineCommand({
  meta: { name: "room", description: "Print a room, or append one line with post" },
  args: {
    target: {
      type: "positional",
      description: "Change id, or post",
      required: false,
    },
    text: {
      type: "positional",
      description: "One line, when the first word is post",
      required: false,
    },
    change: { type: "string", description: "Change id for post" },
    stage: { type: "string", description: "Stage id" },
    type: { type: "string", description: "post, objection, agree, block, or decision" },
    cite: { type: "string", description: "Citation for an objection" },
  },
  async run({ args }) {
    const target = textArg(args.target);
    const text = textArg(args.text);
    await withProject(async ({ root }) => {
      if (target === "post") {
        if (!text?.trim()) {
          process.stderr.write("Missing required positional argument: TEXT\n");
          process.exit(1);
        }
        emit(
          await postRoom(root, {
            change: textArg(args.change),
            stage: textArg(args.stage),
            type: textArg(args.type),
            cite: textArg(args.cite),
            text,
          }),
        );
        return;
      }
      if (text?.trim()) {
        process.stderr.write("A room line starts with post.\n");
        process.exit(1);
      }
      emit(
        await showRoom(root, {
          change: textArg(args.change) ?? target,
          stage: textArg(args.stage),
        }),
      );
    });
  },
});

const review = defineCommand({
  meta: { name: "review", description: "Run one room round" },
  args: {
    change: { type: "positional", description: "Change id", required: false },
    stage: { type: "string", description: "Stage id" },
    roles: { type: "string", description: "Comma-separated bot or role names" },
  },
  async run({ args }) {
    const roles = textArg(args.roles)
      ?.split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    await withProject(async ({ root }) => {
      emit(
        await reviewRoom(root, {
          change: textArg(args.change),
          stage: textArg(args.stage),
          roles,
          model: modelFromEnv(process.env),
        }),
      );
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
    context,
    duplicate: named("duplicate", "Copy a role profile to <name> copy", duplicateRole),
    delete: named("delete", "Delete one role, its conversation, and its memory", deleteRole),
    run,
    allow,
    messaging,
    handoff,
    group,
    network,
    route,
    queue,
    take,
    decide,
    memory,
    lesson,
    room,
    review,
  },
});
