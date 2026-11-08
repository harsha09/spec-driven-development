import { spawn } from "node:child_process";
import { createChange } from "../change.js";
import { pathExists, readText } from "../fs.js";
import type { Config } from "../schemas.js";
import { canonicalRoleName, roleFilePath, splitFrontmatter } from "./profile.js";
import { ROLE_TEXT, type RoleCommandResult } from "./types.js";

const X_LINE = "A connector cannot read or post on X.";
const NOT_IN_SLICE = "That connector is not in this slice.";
const DOES_NOT_RUN = "That connector action does not run in this slice.";
const DRAFT_NEEDS_TEXT = "A draft needs text.";
const BAD_TRACKER_ID = "A tracker record id is one line of text.";
const TRACKERS: Record<string, string> = {
  jira: "Jira",
  aha: "Aha",
  asana: "Asana",
  "azure-devops": "Azure DevOps",
};
const BAD_NUMBER = "A GitHub issue number is a positive integer.";
const BAD_RUN_ID = "A GitHub Actions run id is a positive integer.";
const GH_DEADLINE_MS = 30000;
const QA_LINE = "A routine cannot write a QA result.";
const BAD_ROUTINES = "Routines on this role are invalid.";
const NO_ROUTINE = "That routine is not on this role.";
const READ_FIELDS = new Set(["name", "read", "record"]);

export interface IssueRecord {
  number: number;
  title: string;
  state: string;
}

export type IssueRead = { ok: true; issue: IssueRecord } | { ok: false; missing: boolean };

export interface IssueSource {
  read(number: number): Promise<IssueRead>;
}

export interface ActionsRecord {
  id: string;
  status: string;
  conclusion: string;
}

export type ActionsRead = { ok: true; run: ActionsRecord } | { ok: false; missing: boolean };

export interface ActionsSource {
  read(id: string): Promise<ActionsRead>;
}

export interface TrackerRecord {
  id: string;
  title: string;
  state: string;
}

export type TrackerRead = { ok: true; record: TrackerRecord } | { ok: false; missing: boolean };

export interface TrackerSource {
  read(id: string): Promise<TrackerRead>;
}

interface RoutineItem {
  name: string;
  read: string;
  record: string;
}

function ok(stdout: string): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

function positiveInteger(record: string): number | null {
  if (!/^[1-9][0-9]*$/.test(record)) return null;
  const number = Number(record);
  if (!Number.isSafeInteger(number)) return null;
  return number;
}

function missingLine(number: number): string {
  return `GitHub issue ${number} was not found.`;
}

function unreadLine(number: number): string {
  return `GitHub issue ${number} could not be read.`;
}

function actionsMissing(id: string): string {
  return `GitHub Actions run ${id} was not found.`;
}

function actionsUnread(id: string): string {
  return `GitHub Actions run ${id} could not be read.`;
}

function couldNotOpen(number: number): string {
  return `A change could not be opened for GitHub issue ${number}.`;
}

function trackerMissing(name: string, id: string): string {
  return `${name} record ${id} was not found.`;
}

function trackerUnread(name: string, id: string): string {
  return `${name} record ${id} could not be read.`;
}

function unavailableTracker(): TrackerSource {
  return {
    async read() {
      return { ok: false, missing: false };
    },
  };
}

function cleanLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.includes("\n") || text.includes("\r")) return null;
  return text;
}

export function ghIssueSource(): IssueSource {
  return {
    async read(number) {
      const run = await spawnGh(["issue", "view", String(number), "--json", "number,title,state"]);
      if (!run.ok) return { ok: false, missing: run.missing };
      let parsed: unknown;
      try {
        parsed = JSON.parse(run.stdout);
      } catch {
        return { ok: false, missing: false };
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, missing: false };
      }
      const rec = parsed as Record<string, unknown>;
      const title = cleanLine(rec.title);
      const state = cleanLine(rec.state);
      const found = typeof rec.number === "number" ? rec.number : Number(rec.number);
      if (found !== number || !title || !state) return { ok: false, missing: false };
      return { ok: true, issue: { number, title, state } };
    },
  };
}

export function ghActionsSource(deadlineMs?: number): ActionsSource {
  return {
    async read(id) {
      const run = await spawnGh(
        ["run", "view", id, "--json", "databaseId,status,conclusion"],
        deadlineMs,
      );
      if (!run.ok) return { ok: false, missing: run.missing };
      let parsed: unknown;
      try {
        parsed = JSON.parse(run.stdout);
      } catch {
        return { ok: false, missing: false };
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, missing: false };
      }
      const rec = parsed as Record<string, unknown>;
      const status = cleanLine(rec.status);
      const conclusion = rec.conclusion === null ? "null" : cleanLine(rec.conclusion);
      const found =
        typeof rec.databaseId === "number" && Number.isSafeInteger(rec.databaseId)
          ? String(rec.databaseId)
          : cleanLine(rec.databaseId);
      if (found !== id || !status || !conclusion) return { ok: false, missing: false };
      return { ok: true, run: { id, status, conclusion } };
    },
  };
}

function isHostResolutionFailure(text: string): boolean {
  return (
    text.includes("could not resolve host") ||
    text.includes("couldn't resolve host") ||
    text.includes("cannot resolve host") ||
    text.includes("failed to resolve host") ||
    text.includes("host not found") ||
    text.includes("no such host") ||
    text.includes("name or service not known") ||
    text.includes("temporary failure in name resolution") ||
    text.includes("nodename nor servname")
  );
}

function ghIsMissing(text: string): boolean {
  const lower = text.toLowerCase();
  if (isHostResolutionFailure(lower)) return false;
  return lower.includes("not found") || /\b404\b/.test(lower);
}

function ghDeadline(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return GH_DEADLINE_MS;
}

function spawnGh(
  args: string[],
  deadlineMs?: number,
): Promise<{ ok: true; stdout: string } | { ok: false; missing: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: true; stdout: string } | { ok: false; missing: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn("gh", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The child already exited.
      }
      finish({ ok: false, missing: false });
    }, ghDeadline(deadlineMs));
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", () => finish({ ok: false, missing: false }));
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) {
        finish({ ok: true, stdout });
        return;
      }
      finish({ ok: false, missing: ghIsMissing(`${stdout}\n${stderr}`) });
    });
  });
}

function threeLines(issue: IssueRecord): string {
  return `${issue.number}\n${issue.title}\n${issue.state}`;
}

async function readActionsRun(
  record: string,
  actions: ActionsSource | undefined,
  deadlineMs?: number,
): Promise<RoleCommandResult> {
  const number = positiveInteger(record);
  if (number === null) return fail(BAD_RUN_ID);
  const id = String(number);
  const source = actions ?? ghActionsSource(deadlineMs);
  let read: ActionsRead;
  try {
    read = await source.read(id);
  } catch {
    return fail(actionsUnread(id));
  }
  if (!read.ok) return fail(read.missing ? actionsMissing(id) : actionsUnread(id));
  if (read.run.id !== id) return fail(actionsUnread(id));
  const status = cleanLine(read.run.status);
  const conclusion = cleanLine(read.run.conclusion);
  if (!status || !conclusion) return fail(actionsUnread(id));
  return ok(`${id}\n${status}\n${conclusion}`);
}

export async function readConnector(input: {
  verb: string;
  connector: string;
  record: string;
  source?: IssueSource;
  tracker?: TrackerSource;
  actions?: ActionsSource;
  ghDeadlineMs?: number;
  projectRoot?: string;
  config?: Config;
}): Promise<RoleCommandResult> {
  const verb = input.verb.trim();
  const connector = input.connector.trim();
  const record = input.record.trim();
  if (connector === "x") return fail(X_LINE);
  if (verb !== "read" && verb !== "seed" && verb !== "draft") return fail(DOES_NOT_RUN);
  if (verb === "draft") {
    if (connector !== "slack" && connector !== "teams") return fail(NOT_IN_SLICE);
    const text = cleanLine(record);
    if (!text) return fail(DRAFT_NEEDS_TEXT);
    return ok(`${connector}\n${text}\nnot sent`);
  }
  const trackerName = TRACKERS[connector];
  if (verb === "read" && trackerName) {
    const id = cleanLine(record);
    if (!id) return fail(BAD_TRACKER_ID);
    const tracker = input.tracker ?? unavailableTracker();
    let read: TrackerRead;
    try {
      read = await tracker.read(id);
    } catch {
      return fail(trackerUnread(trackerName, id));
    }
    if (!read.ok) {
      return fail(read.missing ? trackerMissing(trackerName, id) : trackerUnread(trackerName, id));
    }
    const title = cleanLine(read.record.title);
    const state = cleanLine(read.record.state);
    if (read.record.id !== id || !title || !state) return fail(trackerUnread(trackerName, id));
    return ok(`${id}\n${title}\n${state}`);
  }
  if (verb === "read" && connector === "github-actions") {
    return readActionsRun(record, input.actions, input.ghDeadlineMs);
  }
  if (connector !== "github-issue") return fail(NOT_IN_SLICE);
  const number = positiveInteger(record);
  if (number === null) return fail(BAD_NUMBER);
  const source = input.source ?? ghIssueSource();
  let read: IssueRead;
  try {
    read = await source.read(number);
  } catch {
    return fail(unreadLine(number));
  }
  if (!read.ok) return fail(read.missing ? missingLine(number) : unreadLine(number));
  if (read.issue.number !== number) return fail(unreadLine(number));
  const title = cleanLine(read.issue.title);
  const state = cleanLine(read.issue.state);
  if (!title || !state) return fail(unreadLine(number));
  if (verb === "read") return ok(threeLines({ number, title, state }));
  if (!input.projectRoot || !input.config) return fail(couldNotOpen(number));
  try {
    const ctx = await createChange({
      projectRoot: input.projectRoot,
      config: input.config,
      title,
      workflowName: "feature",
      epic: `issue-${number}`,
    });
    return ok(`${number}\n${ctx.id}\n${ctx.meta.stage}`);
  } catch {
    return fail(couldNotOpen(number));
  }
}

function classifyRoutines(
  value: unknown,
): { ok: true; items: RoutineItem[] } | { ok: false; reason: "qa" | "invalid" } {
  if (!Array.isArray(value)) return { ok: false, reason: "invalid" };
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item) && Object.hasOwn(item, "write")) {
      return { ok: false, reason: "qa" };
    }
  }
  const items: RoutineItem[] = [];
  const names = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, reason: "invalid" };
    }
    const rec = item as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length !== 3 || keys.some((key) => !READ_FIELDS.has(key))) {
      return { ok: false, reason: "invalid" };
    }
    const name = rec.name;
    const read = rec.read;
    const record = rec.record;
    if (typeof name !== "string" || typeof read !== "string" || typeof record !== "string") {
      return { ok: false, reason: "invalid" };
    }
    const trimmed = { name: name.trim(), read: read.trim(), record: record.trim() };
    if (!trimmed.name || !trimmed.read || !trimmed.record || names.has(trimmed.name)) {
      return { ok: false, reason: "invalid" };
    }
    names.add(trimmed.name);
    items.push(trimmed);
  }
  return { ok: true, items };
}

export async function runRoutine(
  root: string,
  roleName: string,
  routineName: string,
  source?: IssueSource,
  actions?: ActionsSource,
  ghDeadlineMs?: number,
): Promise<RoleCommandResult> {
  const name = canonicalRoleName(roleName);
  if (!name) return fail(ROLE_TEXT.notFound);
  const path = roleFilePath(root, name);
  if (!(await pathExists(path))) return fail(ROLE_TEXT.notFound);
  let raw = "";
  try {
    raw = await readText(path);
  } catch {
    return fail(ROLE_TEXT.notFound);
  }
  const split = splitFrontmatter(raw);
  if (!split || !Object.hasOwn(split.data, "routines")) return fail(NO_ROUTINE);
  const classified = classifyRoutines(split.data.routines);
  if (!classified.ok) return fail(classified.reason === "qa" ? QA_LINE : BAD_ROUTINES);
  const routine = classified.items.find((item) => item.name === routineName.trim());
  if (!routine) return fail(NO_ROUTINE);
  if (routine.read === "x") return fail(X_LINE);
  return readConnector({
    verb: "read",
    connector: routine.read,
    record: routine.record,
    source,
    actions,
    ghDeadlineMs,
  });
}
