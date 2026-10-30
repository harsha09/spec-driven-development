import { spawn } from "node:child_process";
import { pathExists, readText } from "../fs.js";
import { canonicalRoleName, roleFilePath, splitFrontmatter } from "./profile.js";
import { ROLE_TEXT, type RoleCommandResult } from "./types.js";

const X_LINE = "A connector cannot read or post on X.";
const NOT_IN_SLICE = "That connector is not in this slice.";
const DOES_NOT_RUN = "That connector action does not run in this slice.";
const BAD_NUMBER = "A GitHub issue number is a positive integer.";
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

function cleanLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.includes("\n") || text.includes("\r")) return null;
  return text;
}

export function ghIssueSource(): IssueSource {
  return {
    async read(number) {
      const run = await spawnGh(number);
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

function spawnGh(
  number: number,
): Promise<{ ok: true; stdout: string } | { ok: false; missing: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["issue", "view", String(number), "--json", "number,title,state"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", () => resolve({ ok: false, missing: false }));
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) {
        resolve({ ok: true, stdout });
        return;
      }
      const text = `${stdout}\n${stderr}`.toLowerCase();
      resolve({
        ok: false,
        missing: text.includes("could not resolve") || text.includes("not found"),
      });
    });
  });
}

function threeLines(issue: IssueRecord): string {
  return `${issue.number}\n${issue.title}\n${issue.state}`;
}

export async function readConnector(input: {
  verb: string;
  connector: string;
  record: string;
  source?: IssueSource;
}): Promise<RoleCommandResult> {
  const verb = input.verb.trim();
  const connector = input.connector.trim();
  const record = input.record.trim();
  if (connector === "x") return fail(X_LINE);
  if (verb !== "read") return fail(DOES_NOT_RUN);
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
  return ok(threeLines({ number, title, state }));
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
  });
}
