import { join } from "pathe";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { type ParseOutcome, askModel, parseJsonObject } from "../ask.js";
import { listFiles, pathExists, readText, writeText } from "../fs.js";
import { type LegacyHit, legacyLogger, projectLegacyLog, readKinded } from "../reply-kind.js";
import { DRAFT_FAMILY, DraftReplySchema, PLAN_FAMILY, PlanReplySchema } from "../reply-schemas.js";
import { canonicalRoleName, conversationDir, readRole, roleFilePath } from "./profile.js";
import { leadPrompt, ownerRunPrompt, receiverPrompt } from "./prompts.js";
import { matchRoute, writeHandoffInboxes } from "./routing.js";
import {
  acceptedFile,
  appendJson,
  askRole,
  isSafeProductPath,
  parseSection,
  runIdFrom,
  settleRoleReply,
  timeoutMinutes,
} from "./run.js";
import { ROLE_TEXT, type RoleCommandResult, type RoleModel, type RoleProfile } from "./types.js";

const ID = /^[a-z][a-z0-9-]{0,39}$/;
const ROLE_YAML = ["role.yaml"];

interface SectionFacts {
  id: string;
  decision: string;
  body: string;
  services: string[];
  modules: string[];
  owners: string[];
  leads: string[];
  connection: [string, string] | null;
  product: boolean;
}

interface PlanNode {
  scope: string;
  owner: string;
  decision: string;
  after: string[];
  artifact: string;
  boundary: "ask" | "stop";
  children: PlanNode[];
}

interface PlanFile {
  status: "pending" | "accepted" | "open" | "done";
  rebuilds: number;
  stalled: boolean;
  task: string;
  nodes: PlanNode[];
  results: { decision: string; artifact: string; summary: string }[];
  /** A question an owner asked at a `boundary: ask` node. The run waits for an answer. */
  pending?: { decision: string; owner: string; question: string };
  /** The answers the person gave, kept so the node's next run sees them. */
  answers?: { decision: string; question: string; answer: string }[];
}

interface PlanContext {
  services: Set<string>;
  modules: Set<string>;
  decisions: Set<string>;
}

function ok(stdout = "", runId?: string): RoleCommandResult {
  return runId ? { exitCode: 0, stdout, runId } : { exitCode: 0, stdout };
}

function fail(stdout: string, runId?: string): RoleCommandResult {
  return runId ? { exitCode: 1, stdout, runId } : { exitCode: 1, stdout };
}

function mentionsX(task: string): boolean {
  return /@X|x\.com|twitter\.com/.test(task);
}

function safeChangeId(id: string): boolean {
  if (!id || id.length > 200 || id === "." || id === "..") return false;
  return !id.includes("/") && !id.includes("\\") && !id.includes("\0");
}

function yamlPath(root: string): string {
  return join(root, ".sdd", ...ROLE_YAML);
}

function planPath(root: string, changeId: string, sectionId: string): string {
  return join(root, ".sdd", "role-runs", "plans", changeId, `${sectionId}.json`);
}

async function loadYaml(root: string): Promise<Record<string, unknown> | "missing" | "invalid"> {
  const path = yamlPath(root);
  if (!(await pathExists(path))) return "missing";
  let data: unknown;
  try {
    data = parseYaml(await readText(path));
  } catch {
    return "invalid";
  }
  if (data == null) return {};
  if (typeof data !== "object" || Array.isArray(data)) return "invalid";
  const rec = data as Record<string, unknown>;
  if ("approval_timeout_minutes" in rec && rec.approval_timeout_minutes != null) {
    const minutes = rec.approval_timeout_minutes;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "invalid";
  }
  if (
    "role_messaging" in rec &&
    rec.role_messaging != null &&
    typeof rec.role_messaging !== "boolean"
  ) {
    return "invalid";
  }
  return rec;
}

async function messagingOn(root: string): Promise<boolean | "invalid"> {
  const loaded = await loadYaml(root);
  if (loaded === "invalid") return "invalid";
  if (loaded === "missing") return true;
  return loaded.role_messaging !== false;
}

export async function setRoleMessaging(root: string, enabled: boolean): Promise<RoleCommandResult> {
  const loaded = await loadYaml(root);
  if (loaded === "invalid") return fail(ROLE_TEXT.badYaml);
  const raw = loaded === "missing" ? {} : loaded;
  raw.role_messaging = enabled;
  await writeText(yamlPath(root), stringifyYaml(raw));
  return ok(enabled ? "Messaging between roles is on." : "Messaging between roles is off.");
}

function field(body: string, prefix: string): string[] {
  const found: string[] = [];
  for (const row of body.split(/\r?\n/)) {
    const trimmed = row.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const value = trimmed.slice(prefix.length).trim();
    if (value) found.push(value);
  }
  return found;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    found.push(item);
  }
  return found;
}

function factsFrom(markdown: string): SectionFacts[] {
  const ids: string[] = [];
  for (const row of markdown.split(/\r?\n/)) {
    if (row.startsWith("## ")) {
      const id = row.slice(3).trim();
      if (id) ids.push(id);
    }
  }
  const facts: SectionFacts[] = [];
  for (const id of ids) {
    const section = parseSection(markdown, id);
    if (!section) continue;
    const services = field(section.body, "service: ").filter((item) => ID.test(item));
    const modules = field(section.body, "module: ").filter((item) => ID.test(item));
    const owners = field(section.body, "owner: ").filter(
      (item) => canonicalRoleName(item) === item,
    );
    const leads = field(section.body, "lead: ").filter((item) => canonicalRoleName(item) === item);
    const connection = connectionOf(section.body);
    facts.push({
      id: section.id,
      decision: section.decision,
      body: section.body,
      services,
      modules,
      owners,
      leads,
      connection,
      product: field(section.body, "scope: ").includes("product"),
    });
  }
  return facts;
}

function connectionOf(body: string): [string, string] | null {
  for (const value of field(body, "connection: ")) {
    const parts = value.split(/\s+/);
    if (parts.length === 2 && parts[0] && parts[1] && ID.test(parts[0]) && ID.test(parts[1])) {
      return [parts[0], parts[1]];
    }
  }
  return null;
}

async function acceptedFacts(
  root: string,
  changeId: string,
  sectionId: string,
): Promise<{ markdown: string; current: SectionFacts; all: SectionFacts[] } | null> {
  if (!safeChangeId(changeId) || !sectionId) return null;
  const path = await acceptedFile(root, changeId);
  if (!(await pathExists(path))) return null;
  const markdown = await readText(path);
  const all = factsFrom(markdown);
  const current = all.find((item) => item.id === sectionId);
  if (!current) return null;
  return { markdown, current, all };
}

function handoffRecord(
  from: string,
  to: string,
  changeId: string,
  section: SectionFacts,
): Record<string, string> {
  return {
    type: "handoff",
    from,
    to,
    change: changeId,
    section: section.id,
    decision: section.decision,
  };
}

export async function handoffRole(
  root: string,
  input: {
    from: string;
    to: string;
    task?: string;
    change?: string;
    section?: string;
    model?: RoleModel;
    now?: () => Date;
  },
): Promise<RoleCommandResult> {
  const from = canonicalRoleName(input.from);
  const to = canonicalRoleName(input.to);
  if (!from || !to) return fail(ROLE_TEXT.badName);
  if (from === to) return fail("A role cannot hand off to itself.");
  const sender = await readRole(root, from);
  const receiver = await readRole(root, to);
  if (!sender || !receiver) return fail(ROLE_TEXT.notFound);
  const task = input.task ?? "";
  if (mentionsX(task)) return fail(ROLE_TEXT.x);
  const loaded = await acceptedFacts(root, input.change?.trim() ?? "", input.section?.trim() ?? "");
  if (!loaded) return fail(ROLE_TEXT.needsSection);
  if (loaded.current.owners.length > 0 && !loaded.current.owners.includes(to)) {
    return fail("One owner handles this section.");
  }
  const messaging = await messagingOn(root);
  if (messaging === false) return ok("Messaging between roles is off.");
  if (!input.model) return fail(ROLE_TEXT.noModel);
  if (messaging === "invalid") return fail(ROLE_TEXT.badYaml);

  const now = (input.now ?? (() => new Date()))();
  const runId = runIdFrom(now);
  const senderFile = join(conversationDir(root, from), `${runId}.jsonl`);
  const receiverFile = join(conversationDir(root, to), `${runId}.jsonl`);
  const record = handoffRecord(from, to, input.change?.trim() ?? "", loaded.current);
  await appendJson(senderFile, record);
  await appendJson(receiverFile, record);
  await writeHandoffInboxes(root, record);
  const parsed = await askRole({
    model: input.model,
    file: receiverFile,
    roleId: to,
    prompt: receiverPrompt(receiver, task, loaded.current),
    pass: 1,
    schema: DraftReplySchema,
    family: DRAFT_FAMILY,
    legacy: legacyLogger(receiverFile),
  });
  if (!parsed) return fail("", runId);
  const settled = await settleRoleReply(root, receiverFile, receiver, parsed, now, runId);
  await appendJson(senderFile, {
    type: "handoff_reply",
    from: to,
    to: from,
    change: record.change,
    section: record.section,
    decision: record.decision,
    summary: parsed.text,
  });
  return settled;
}

export async function showRoleGroup(root: string, changeId: string): Promise<RoleCommandResult> {
  const path = safeChangeId(changeId) ? await acceptedFile(root, changeId) : "";
  if (!path || !(await pathExists(path))) return ok("No roles in this group.");
  const seen = new Set<string>();
  const owners: string[] = [];
  for (const section of factsFrom(await readText(path))) {
    for (const owner of section.owners) {
      if (seen.has(owner)) continue;
      seen.add(owner);
      owners.push(owner);
    }
  }
  return ok(owners.length > 0 ? owners.join("\n") : "No roles in this group.");
}

function distinctServices(all: SectionFacts[]): Map<string, SectionFacts> {
  const services = new Map<string, SectionFacts>();
  for (const section of all) {
    for (const service of section.services) {
      if (!services.has(service)) services.set(service, section);
    }
  }
  return services;
}

function nodeLine(node: PlanNode): string {
  const after = node.after.length > 0 ? node.after.join(",") : "none";
  return `${node.scope} ${node.owner} ${node.decision} after ${after} artifact ${node.artifact} boundary ${node.boundary}`;
}

function planLines(nodes: PlanNode[]): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    lines.push(nodeLine(node));
    lines.push(...planLines(node.children));
  }
  return lines;
}

function artifactsOf(nodes: PlanNode[]): string[] {
  const artifacts: string[] = [];
  for (const node of nodes) {
    artifacts.push(node.artifact);
    artifacts.push(...artifactsOf(node.children));
  }
  return artifacts;
}

async function readPlan(
  root: string,
  changeId: string,
  sectionId: string,
): Promise<PlanFile | null> {
  const path = planPath(root, changeId, sectionId);
  if (!(await pathExists(path))) return null;
  try {
    const data = JSON.parse(await readText(path)) as PlanFile;
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.results)) return null;
    return data;
  } catch {
    return null;
  }
}

async function writePlan(
  root: string,
  changeId: string,
  sectionId: string,
  plan: PlanFile,
): Promise<void> {
  await writeText(planPath(root, changeId, sectionId), `${JSON.stringify(plan, null, 2)}\n`);
}

function contextOf(all: SectionFacts[]): PlanContext {
  const services = new Set<string>();
  const modules = new Set<string>();
  const decisions = new Set<string>();
  for (const section of all) {
    for (const service of section.services) services.add(service);
    for (const moduleId of section.modules) modules.add(moduleId);
    decisions.add(section.decision);
  }
  return { services, modules, decisions };
}

/** The names of the roles that exist, so a plan can name only those. */
async function roleNames(root: string): Promise<Set<string>> {
  const names = new Set<string>();
  const dir = join(roleFilePath(root, "x"), "..");
  for (const file of await listFiles(dir)) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    if (await readRole(root, name)) names.add(name);
  }
  return names;
}

type PlanRead = { deep: true } | { deep: false; nodes: PlanNode[]; legacy?: LegacyHit };

function tooDeep(plan: unknown[]): boolean {
  for (const node of plan) {
    if (!node || typeof node !== "object") continue;
    const children = (node as Record<string, unknown>).children;
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      const grand = (child as Record<string, unknown>).children;
      if (Array.isArray(grand) && grand.length > 0) return true;
    }
  }
  return false;
}

type RawNode = Omit<PlanNode, "children"> & { children?: Omit<PlanNode, "children">[] };

/** Problems in a plan that the schema cannot see: ids that are not listed, a repeat, a bad path. */
function planIssues(plan: RawNode[], ctx: PlanContext, owners: Set<string>): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const check = (node: Omit<PlanNode, "children">, at: string): void => {
    if (!ctx.services.has(node.scope) && !ctx.modules.has(node.scope)) {
      issues.push(`${at}.scope: "${node.scope}" is not a service or module in Services`);
    }
    if (!owners.has(node.owner)) {
      issues.push(`${at}.owner: "${node.owner}" is not a role in Owners`);
    }
    if (!ctx.decisions.has(node.decision)) {
      issues.push(`${at}.decision: "${node.decision}" is not a decision in Services`);
    } else if (seen.has(node.decision)) {
      issues.push(`${at}.decision: "${node.decision}" is used twice`);
    }
    seen.add(node.decision);
    for (const id of node.after) {
      if (!ctx.decisions.has(id)) {
        issues.push(`${at}.after: "${id}" is not a decision in Services`);
      }
    }
    if (!isSafeProductPath(node.artifact)) {
      issues.push(`${at}.artifact: "${node.artifact}" is not a relative path inside the project`);
    }
  };
  plan.forEach((node, index) => {
    check(node, `plan[${index}]`);
    (node.children ?? []).forEach((child, at) => check(child, `plan[${index}].children[${at}]`));
  });
  return issues;
}

/**
 * Read a lead's reply. A plan that is deeper than 2 is not repaired: it ends the run with
 * "A plan is deeper than 2." as before. Every other problem is a repair issue.
 */
function readPlanReply(raw: string, ctx: PlanContext, owners: Set<string>): ParseOutcome<PlanRead> {
  const object = parseJsonObject(raw);
  if (!object.ok) return object;
  if (Array.isArray(object.value.plan) && tooDeep(object.value.plan)) {
    return { ok: true, value: { deep: true } };
  }
  const read = readKinded(PlanReplySchema, PLAN_FAMILY)(raw);
  if (!read.ok) return read;
  const plan = read.value.value.plan as RawNode[];
  const issues = planIssues(plan, ctx, owners);
  if (issues.length > 0) return { ok: false, issues };
  const nodes: PlanNode[] = plan.map((node) => ({
    ...node,
    children: (node.children ?? []).map((child) => ({ ...child, children: [] })),
  }));
  return { ok: true, value: { deep: false, nodes, legacy: read.value.legacy } };
}

function leadServices(
  services: Map<string, SectionFacts>,
): { service: string; module: string; owner: string; decision: string }[] {
  return [...services].map(([service, section]) => ({
    service,
    module: section.modules[0] ?? "none",
    owner: section.owners[0] ?? "none",
    decision: section.decision,
  }));
}

async function connectionResult(
  root: string,
  changeId: string,
  section: SectionFacts,
  now: Date,
): Promise<RoleCommandResult> {
  const messaging = await messagingOn(root);
  if (messaging === "invalid") return fail(ROLE_TEXT.badYaml);
  if (!messaging) return ok("Messaging between roles is off.");
  const owners = unique(section.owners);
  const runId = runIdFrom(now);
  for (let i = 0; i < owners.length - 1; i++) {
    const from = owners[i] ?? "";
    const to = owners[i + 1] ?? "";
    const record = handoffRecord(from, to, changeId, section);
    await appendJson(join(conversationDir(root, from), `${runId}.jsonl`), record);
    await appendJson(join(conversationDir(root, to), `${runId}.jsonl`), record);
    await writeHandoffInboxes(root, record);
  }
  const lines = ["Connection hands off. Lead is absent.", ...owners];
  return ok(lines.join("\n"));
}

function freshPlan(task: string, nodes: PlanNode[]): PlanFile {
  return { status: "pending", rebuilds: 0, stalled: false, task, nodes, results: [] };
}

export async function planNetwork(
  root: string,
  input: { change?: string; section?: string; task?: string; model?: RoleModel; now?: () => Date },
): Promise<RoleCommandResult> {
  const changeId = input.change?.trim() ?? "";
  const sectionId = input.section?.trim() ?? "";
  const loaded = await acceptedFacts(root, changeId, sectionId);
  if (!loaded) return fail(ROLE_TEXT.needsSection);
  const task = input.task ?? "";
  const now = (input.now ?? (() => new Date()))();
  const connection = loaded.all.find(
    (item) =>
      item.connection &&
      (item.id === loaded.current.id ||
        loaded.current.services.some((service) => item.connection?.includes(service))),
  );
  if (connection?.connection) return connectionResult(root, changeId, connection, now);

  const services = distinctServices(loaded.all);
  if (services.size === 0) return ok("One scope. No lead.");
  if (services.size === 1) {
    const entry = [...services.entries()][0];
    if (!entry) return ok("One scope. No lead.");
    const [name, section] = entry;
    const owner = section.owners[0];
    if (!owner) return fail("This service needs an owner.");
    if (!(await readRole(root, owner))) return fail(ROLE_TEXT.notFound);
    return ok(`Service ${name} runs ${owner}.`);
  }

  const picked = await pickLead(root, loaded.all, services);
  if (picked.kind === "none") return ok("One scope. No lead.");
  if (picked.kind === "missing") return fail(picked.sentence);
  const lead = await readRole(root, picked.name);
  if (!lead) return fail(ROLE_TEXT.notFound);
  if ((await messagingOn(root)) === "invalid") return fail(ROLE_TEXT.badYaml);
  if (!input.model) return fail(ROLE_TEXT.noModel);
  return storeLeadPlan(
    root,
    changeId,
    sectionId,
    task,
    lead,
    services,
    loaded.all,
    input.model,
    null,
  );
}

async function storeLeadPlan(
  root: string,
  changeId: string,
  sectionId: string,
  task: string,
  lead: RoleProfile,
  services: Map<string, SectionFacts>,
  all: SectionFacts[],
  model: RoleModel,
  previous: PlanFile | null,
): Promise<RoleCommandResult> {
  const owners = await roleNames(root);
  const ctx = contextOf(all);
  let tried = false;
  const asked = await askModel<PlanRead>({
    model,
    roleId: lead.name,
    prompt: leadPrompt({
      lead,
      task,
      services: leadServices(services),
      owners: [...owners].sort(),
    }),
    parse: (raw) => readPlanReply(raw, ctx, owners),
    onRepair: () => {
      tried = true;
    },
  });
  if (!asked.ok && asked.reason === "model_error" && !tried) return fail("");
  if (!asked.ok) return fail(planFailure("invalid"));
  if (asked.value.deep) return fail(planFailure("deep"));
  const parsed = asked.value.nodes;
  if (asked.value.legacy) {
    await legacyLogger(projectLegacyLog(root), { stamp: () => new Date().toISOString() })(
      lead.name,
      asked.value.legacy,
    );
  }
  if (previous && sameArtifacts(previous.nodes, parsed)) {
    previous.stalled = true;
    previous.rebuilds += 1;
    await writePlan(root, changeId, sectionId, previous);
    return ok("Stopped. The plan made no progress.");
  }
  const next = previous
    ? {
        ...previous,
        status: "pending" as const,
        stalled: false,
        rebuilds: previous.rebuilds + 1,
        nodes: parsed,
        results: [],
        pending: undefined,
        answers: [],
      }
    : freshPlan(task, parsed);
  await writePlan(root, changeId, sectionId, next);
  return ok(["Accept this plan before anyone writes.", ...planLines(parsed)].join("\n"));
}

function planFailure(parsed: "invalid" | "deep"): string {
  return parsed === "deep" ? "A plan is deeper than 2." : "The plan is not valid.";
}

function sameArtifacts(left: PlanNode[], right: PlanNode[]): boolean {
  const a = artifactsOf(left).slice().sort();
  const b = artifactsOf(right).slice().sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export async function acceptNetwork(
  root: string,
  input: { change?: string; section?: string },
): Promise<RoleCommandResult> {
  const changeId = input.change?.trim() ?? "";
  const sectionId = input.section?.trim() ?? "";
  if (!safeChangeId(changeId) || !sectionId) return fail("No plan is stored.");
  const plan = await readPlan(root, changeId, sectionId);
  if (!plan) return fail("No plan is stored.");
  if (plan.status !== "pending") return fail("The plan is not waiting for acceptance.");
  plan.status = "accepted";
  await writePlan(root, changeId, sectionId, plan);
  return ok("Plan accepted.");
}

function walk(nodes: PlanNode[]): PlanNode[] {
  const flat: PlanNode[] = [];
  for (const node of nodes) {
    flat.push(node);
    flat.push(...walk(node.children));
  }
  return flat;
}

function ready(node: PlanNode, results: PlanFile["results"]): boolean {
  if (results.some((item) => item.decision === node.decision)) return false;
  const afterOk = node.after.every((id) => results.some((item) => item.decision === id));
  const childrenOk = node.children.every((child) =>
    results.some((item) => item.decision === child.decision),
  );
  return afterOk && childrenOk;
}

const QUESTION = /^Question:\s*/;
const ANSWER_LIMIT = 2000;
/** The most questions one node may ask. After that its reply is taken as its result. */
const QUESTION_LIMIT = 3;

function questionText(
  changeId: string,
  sectionId: string,
  pending: { owner: string; question: string },
): string {
  return [
    "Question:",
    `${pending.owner} asks:`,
    pending.question,
    `Answer with: sdd role network run --change ${changeId} --section ${sectionId} --answer "..."`,
  ].join("\n");
}

export async function runNetwork(
  root: string,
  input: {
    change?: string;
    section?: string;
    answer?: string;
    model?: RoleModel;
    now?: () => Date;
  },
): Promise<RoleCommandResult> {
  const changeId = input.change?.trim() ?? "";
  const sectionId = input.section?.trim() ?? "";
  if (!safeChangeId(changeId) || !sectionId) return fail("No plan is stored.");
  const plan = await readPlan(root, changeId, sectionId);
  if (!plan) return fail("No plan is stored.");
  if (plan.status === "pending") return ok("Accept this plan before anyone writes.");
  if (plan.status === "done") return ok("The parent is done.");
  if (plan.status !== "accepted" && plan.status !== "open") return fail("No plan is stored.");
  const answer = input.answer?.trim();
  if (input.answer !== undefined && !plan.pending) return fail("No question is waiting.");
  if (plan.pending && !answer) return ok(questionText(changeId, sectionId, plan.pending));
  if ((await messagingOn(root)) === "invalid") return fail(ROLE_TEXT.badYaml);
  const minutes = await timeoutMinutes(root);
  if (minutes === "invalid") return fail(ROLE_TEXT.badYaml);
  if (!input.model) return fail(ROLE_TEXT.noModel);
  if (plan.pending && answer) {
    if (answer.length > ANSWER_LIMIT) return fail("The answer is too long.");
    plan.answers = [
      ...(plan.answers ?? []),
      { decision: plan.pending.decision, question: plan.pending.question, answer },
    ];
    plan.pending = undefined;
  }
  const now = (input.now ?? (() => new Date()))();
  const summaries: string[] = [];
  const called = new Set<string>();
  let index = 0;
  let progressed = true;
  let missingOwner = false;
  let paused = false;
  while (progressed && !missingOwner && !paused) {
    progressed = false;
    for (const node of walk(plan.nodes)) {
      if (!ready(node, plan.results) || called.has(node.decision)) continue;
      called.add(node.decision);
      const owner = await readRole(root, node.owner);
      if (!owner) {
        missingOwner = true;
        break;
      }
      const when = new Date(now.getTime() + index * 1000);
      index += 1;
      const runId = runIdFrom(when);
      const file = join(conversationDir(root, owner.name), `${runId}.jsonl`);
      const mine = (plan.answers ?? []).filter((item) => item.decision === node.decision);
      const parsed = await askRole({
        model: input.model,
        file,
        roleId: owner.name,
        prompt: ownerRunPrompt({
          owner,
          task: plan.task,
          artifact: node.artifact,
          boundary: node.boundary,
          prior: [...node.after, ...node.children.map((child) => child.decision)].flatMap((id) => {
            const found = plan.results.find((item) => item.decision === id);
            return found ? [{ decision: id, summary: found.summary }] : [];
          }),
          answers: mine,
        }),
        pass: 1,
        schema: DraftReplySchema,
        family: DRAFT_FAMILY,
        legacy: legacyLogger(file),
      });
      if (!parsed) continue;
      const asked = QUESTION.test(parsed.text) && node.boundary === "ask";
      if (asked && mine.length < QUESTION_LIMIT) {
        const question = parsed.text.replace(QUESTION, "").trim() || parsed.text;
        plan.pending = { decision: node.decision, owner: owner.name, question };
        await appendJson(file, { type: "question", roleId: owner.name, question });
        paused = true;
        break;
      }
      if (parsed.action) {
        const expiresAt = new Date(when.getTime() + minutes * 60_000).toISOString();
        await appendJson(file, {
          type: "pending",
          action: {
            name: parsed.action.name,
            words: parsed.action.words,
            inputs: parsed.action.inputs,
          },
          expiresAt,
        });
      }
      plan.results.push({
        decision: node.decision,
        artifact: node.artifact,
        summary: parsed.text,
      });
      summaries.push(`${owner.name}: ${parsed.text}`);
      progressed = true;
    }
  }
  const all = walk(plan.nodes);
  const waiting = all.some((node) => !plan.results.some((item) => item.decision === node.decision));
  plan.status = waiting ? "open" : "done";
  await writePlan(root, changeId, sectionId, plan);
  if (missingOwner) return fail(ROLE_TEXT.notFound);
  const lines = [...summaries];
  if (plan.pending) {
    lines.push(questionText(changeId, sectionId, plan.pending));
    return ok(lines.join("\n"));
  }
  if (waiting) {
    lines.push("A branch is waiting for its prerequisites.");
    lines.push("The parent stays open.");
  } else {
    lines.push("The parent is done.");
  }
  return ok(lines.join("\n"));
}

export async function rebuildNetwork(
  root: string,
  input: { change?: string; section?: string; model?: RoleModel; now?: () => Date },
): Promise<RoleCommandResult> {
  const changeId = input.change?.trim() ?? "";
  const sectionId = input.section?.trim() ?? "";
  if (!safeChangeId(changeId) || !sectionId) return fail("No plan is stored.");
  const plan = await readPlan(root, changeId, sectionId);
  if (!plan) return fail("No plan is stored.");
  const allowed =
    plan.rebuilds === 0 || (plan.rebuilds === 1 && !plan.stalled && plan.status === "accepted");
  if (!allowed) return fail("A second rebuild does not start.");
  const loaded = await acceptedFacts(root, changeId, sectionId);
  if (!loaded) return fail(ROLE_TEXT.needsSection);
  if (!input.model) return fail(ROLE_TEXT.noModel);
  const services = distinctServices(loaded.all);
  const picked = await pickLead(root, loaded.all, services);
  if (picked.kind === "missing") return fail(picked.sentence);
  if (picked.kind !== "lead") return fail("This module needs a lead.");
  const lead = await readRole(root, picked.name);
  if (!lead) return fail(ROLE_TEXT.notFound);
  const before = JSON.stringify(plan);
  const result = await storeLeadPlan(
    root,
    changeId,
    sectionId,
    plan.task,
    lead,
    services,
    loaded.all,
    input.model,
    plan,
  );
  if (result.exitCode !== 0) {
    const current = await readPlan(root, changeId, sectionId);
    if (current && JSON.stringify(current) !== before) {
      await writePlan(root, changeId, sectionId, JSON.parse(before) as PlanFile);
    }
  }
  return result;
}

async function chooseLead(
  root: string,
  sections: SectionFacts[],
  missing: string,
): Promise<{ kind: "lead"; name: string } | { kind: "missing"; sentence: string }> {
  const routed = await matchRoute(root, { stage: "network", skill: "name the next owner" });
  if (!routed.ok) return { kind: "missing", sentence: routed.message };
  if (routed.match.kind === "role") return { kind: "lead", name: routed.match.role };
  if (routed.match.reason !== "No rule matched.") {
    return { kind: "missing", sentence: "Ask the human." };
  }
  const names: string[] = [];
  for (const section of sections) {
    for (const lead of section.leads) {
      if (!names.includes(lead)) names.push(lead);
    }
  }
  if (names.length === 1) {
    const name = names[0];
    if (name) return { kind: "lead", name };
  }
  if (names.length === 0) return { kind: "missing", sentence: missing };
  return { kind: "missing", sentence: "Ask the human." };
}

async function pickLead(
  root: string,
  all: SectionFacts[],
  services: Map<string, SectionFacts>,
): Promise<
  { kind: "lead"; name: string } | { kind: "missing"; sentence: string } | { kind: "none" }
> {
  const modules = new Set<string>();
  let missingModule = false;
  for (const section of services.values()) {
    const moduleId = section.modules[0];
    if (!moduleId) missingModule = true;
    else modules.add(moduleId);
  }
  const moduleId = [...modules][0];
  if (!missingModule && modules.size === 1 && moduleId && services.size > 1) {
    return chooseLead(
      root,
      all.filter((item) => item.modules.includes(moduleId)),
      "This module needs a lead.",
    );
  }
  if (modules.size > 1) {
    return chooseLead(
      root,
      all.filter((item) => item.product),
      "This product needs a lead.",
    );
  }
  return { kind: "none" };
}
