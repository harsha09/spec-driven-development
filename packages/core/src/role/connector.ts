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
const JENKINS_DEADLINE_MS = 30000;
const BAD_JENKINS_ID = "A Jenkins build id is a job name and a positive integer.";
const JENKINS_HTTPS = "A Jenkins URL must use HTTPS.";
const JENKINS_CREDENTIALS = "A Jenkins URL must not include credentials.";
const JENKINS_TOKEN_ENV = "A Jenkins token_env must name an environment variable.";
const JENKINS_USER_ENV = "A Jenkins user_env must name an environment variable.";
const JFROG_DEADLINE_MS = 30000;
const BAD_JFROG_ID = "A JFrog artifact id is a repository and a path.";
const JFROG_HTTPS = "A JFrog URL must use HTTPS.";
const JFROG_CREDENTIALS = "A JFrog URL must not include credentials.";
const JFROG_TOKEN_ENV = "A JFrog token_env must name an environment variable.";
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const JOB_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const JFROG_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/;
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

function jfrogMissing(id: string): string {
  return `JFrog artifact ${id} was not found.`;
}

function jfrogUnread(id: string): string {
  return `JFrog artifact ${id} could not be read.`;
}

function jenkinsMissing(id: string): string {
  return `Jenkins build ${id} was not found.`;
}

function jenkinsUnread(id: string): string {
  return `Jenkins build ${id} could not be read.`;
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

function jenkinsDeadline(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return JENKINS_DEADLINE_MS;
}

function jenkinsSegments(parts: string[]): boolean {
  if (parts.length === 1) return JOB_NAME.test(parts[0] ?? "");
  if (parts.length % 2 === 0) return false;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    if (index % 2 === 1) {
      if (part !== "job") return false;
      continue;
    }
    if (!JOB_NAME.test(part)) return false;
  }
  return true;
}

function parseJenkinsRecord(
  record: string,
): { segments: string[]; build: number; id: string } | null {
  if (!record || /[?#%\\]/.test(record)) return null;
  const parts = record.split("/");
  if (parts.length < 2 || parts.some((part) => part.length === 0)) return null;
  const build = positiveInteger(parts[parts.length - 1] ?? "");
  if (build === null) return null;
  const segments = parts.slice(0, -1);
  if (!jenkinsSegments(segments)) return null;
  return { segments, build, id: `${segments.join("/")}/${build}` };
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function jenkinsBuildUrl(base: string, segments: string[], build: number): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const local = isLocalHost(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  const path = url.pathname;
  if (path.includes("..") || path.includes("\\") || path.toLowerCase().includes("%2e")) return null;
  const prefix = path.replace(/\/+$/, "");
  const encoded = segments.map((segment) => encodeURIComponent(segment)).join("/");
  url.pathname = `${prefix}/job/${encoded}/${build}/api/json`;
  url.search = "tree=number,building,result";
  url.hash = "";
  return url.toString();
}

function envName(value: string | undefined): string | null {
  if (!value || !ENV_NAME.test(value)) return null;
  return value;
}

function secretText(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value || value !== value.trim() || value.includes("\n") || value.includes("\r")) return null;
  return value;
}

function jenkinsAuthorization(
  env: Readonly<Record<string, string | undefined>>,
  tokenEnv: string,
  userEnv: string | null | undefined,
): string | null {
  const token = secretText(env[tokenEnv]);
  if (!token) return null;
  if (userEnv === null) return null;
  if (!userEnv) return `Bearer ${token}`;
  const user = secretText(env[userEnv]);
  if (!user || user.includes(":")) return null;
  return `Basic ${Buffer.from(`${user}:${token}`, "utf8").toString("base64")}`;
}

function leaks(text: string, secret: string): boolean {
  return secret.length > 0 && text.includes(secret);
}

function jenkinsFail(id: string, secret: string, missing: boolean): RoleCommandResult {
  if (leaks(id, secret)) {
    return fail(missing ? "Jenkins build was not found." : "Jenkins build could not be read.");
  }
  return fail(missing ? jenkinsMissing(id) : jenkinsUnread(id));
}

async function readJenkinsBuild(input: {
  record: string;
  config?: Config;
  env?: Readonly<Record<string, string | undefined>>;
  jenkinsDeadlineMs?: number;
}): Promise<RoleCommandResult> {
  const parsed = parseJenkinsRecord(input.record.trim());
  if (!parsed) return fail(BAD_JENKINS_ID);
  const { segments, build, id } = parsed;
  const jenkins = input.config?.jenkins;
  const tokenEnv = envName(jenkins?.token_env);
  const userEnv = jenkins?.user_env === undefined ? undefined : envName(jenkins.user_env);
  if (!jenkins?.url || !tokenEnv || (jenkins.user_env !== undefined && !userEnv)) {
    if (jenkins?.token_env && !tokenEnv) return fail(JENKINS_TOKEN_ENV);
    if (jenkins?.user_env !== undefined && !userEnv) return fail(JENKINS_USER_ENV);
    return fail(jenkinsUnread(id));
  }
  const env = input.env ?? process.env;
  const token = secretText(env[tokenEnv]) ?? "";
  if (!token) return fail(jenkinsUnread(id));
  let base: URL;
  try {
    base = new URL(jenkins.url);
  } catch {
    return jenkinsFail(id, token, false);
  }
  if (base.username || base.password) return fail(JENKINS_CREDENTIALS);
  if (leaks(jenkins.url, token)) return jenkinsFail(id, token, false);
  const localHttp = base.protocol === "http:" && isLocalHost(base.hostname);
  if (base.protocol !== "https:" && !localHttp) return fail(JENKINS_HTTPS);
  const target = jenkinsBuildUrl(jenkins.url, segments, build);
  if (!target || leaks(target, token)) return jenkinsFail(id, token, false);
  const authorization = jenkinsAuthorization(env, tokenEnv, userEnv);
  if (!authorization) return jenkinsFail(id, token, false);
  const deadline = jenkinsDeadline(input.jenkinsDeadlineMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadline);
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: authorization },
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 404) return jenkinsFail(id, token, true);
    if (!response.ok) return jenkinsFail(id, token, false);
    const text = await response.text();
    if (leaks(text, token)) return jenkinsFail(id, token, false);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jenkinsFail(id, token, false);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return jenkinsFail(id, token, false);
    const rec = body as Record<string, unknown>;
    const number =
      typeof rec.number === "number" && Number.isSafeInteger(rec.number) ? rec.number : null;
    if (number !== build) return jenkinsFail(id, token, false);
    const building = rec.building === true;
    if (building || rec.result === null) {
      return ok(`${id}\nin_progress\nnull`);
    }
    const conclusion = cleanLine(typeof rec.result === "string" ? rec.result.toLowerCase() : null);
    if (!conclusion || leaks(conclusion, token) || leaks(id, token))
      return jenkinsFail(id, token, false);
    return ok(`${id}\ncompleted\n${conclusion}`);
  } catch {
    return jenkinsFail(id, token, false);
  } finally {
    clearTimeout(timer);
  }
}

function jfrogDeadline(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return JFROG_DEADLINE_MS;
}

function parseJfrogRecord(record: string): { repo: string; segments: string[]; id: string } | null {
  if (!record || record.startsWith("/") || /[?#%\\]/.test(record)) return null;
  const parts = record.split("/");
  if (parts.length < 2 || parts.some((part) => !JFROG_SEGMENT.test(part))) return null;
  const repo = parts[0] ?? "";
  const segments = parts.slice(1);
  return { repo, segments, id: parts.join("/") };
}

function jfrogStorageUrl(base: string, repo: string, segments: string[]): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const local = isLocalHost(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  const path = url.pathname;
  if (path.includes("..") || path.includes("\\") || path.toLowerCase().includes("%2e")) return null;
  const prefix = path.replace(/\/+$/, "");
  const encoded = [repo, ...segments].map((segment) => encodeURIComponent(segment)).join("/");
  url.pathname = `${prefix}/api/storage/${encoded}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function jfrogFail(id: string, secret: string, missing: boolean): RoleCommandResult {
  if (leaks(id, secret)) {
    return fail(missing ? "JFrog artifact was not found." : "JFrog artifact could not be read.");
  }
  return fail(missing ? jfrogMissing(id) : jfrogUnread(id));
}

function digitText(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  return null;
}

function checksumLines(value: unknown, secret: string): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const lines: string[] = [];
  for (const name of ["md5", "sha1", "sha256"]) {
    const text = cleanLine(rec[name]);
    if (!text) continue;
    if (leaks(text, secret)) return null;
    lines.push(`${name}: ${text}`);
  }
  return lines.length > 0 ? lines : null;
}

function propertyLines(body: unknown, secret: string): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const props = (body as Record<string, unknown>).properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  const lines: string[] = [];
  for (const key of Object.keys(props).sort()) {
    const name = cleanLine(key);
    const raw = (props as Record<string, unknown>)[key];
    const values = Array.isArray(raw) ? raw : [raw];
    const cleaned: string[] = [];
    for (const value of values) {
      const text = cleanLine(value);
      if (!text) return [];
      cleaned.push(text);
    }
    if (!name || cleaned.length === 0) return [];
    const rendered = `${name}: ${cleaned.join(", ")}`;
    if (leaks(rendered, secret)) return [];
    lines.push(rendered);
  }
  return lines;
}

async function readJfrogArtifact(input: {
  record: string;
  config?: Config;
  env?: Readonly<Record<string, string | undefined>>;
  jfrogDeadlineMs?: number;
}): Promise<RoleCommandResult> {
  const parsed = parseJfrogRecord(input.record.trim());
  if (!parsed) return fail(BAD_JFROG_ID);
  const { repo, segments, id } = parsed;
  const jfrog = input.config?.jfrog;
  const tokenEnv = envName(jfrog?.token_env);
  if (!jfrog?.url || !tokenEnv) {
    if (jfrog?.token_env && !tokenEnv) return fail(JFROG_TOKEN_ENV);
    return fail(jfrogUnread(id));
  }
  const env = input.env ?? process.env;
  const token = secretText(env[tokenEnv]) ?? "";
  if (!token || leaks(id, token)) return jfrogFail(id, token, false);
  let base: URL;
  try {
    base = new URL(jfrog.url);
  } catch {
    return jfrogFail(id, token, false);
  }
  if (base.username || base.password) return fail(JFROG_CREDENTIALS);
  if (leaks(jfrog.url, token)) return jfrogFail(id, token, false);
  const localHttp = base.protocol === "http:" && isLocalHost(base.hostname);
  if (base.protocol !== "https:" && !localHttp) return fail(JFROG_HTTPS);
  const target = jfrogStorageUrl(jfrog.url, repo, segments);
  if (!target || leaks(target, token)) return jfrogFail(id, token, false);
  const deadline = jfrogDeadline(input.jfrogDeadlineMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadline);
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
  try {
    const response = await fetch(target, {
      method: "GET",
      headers,
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 404) return jfrogFail(id, token, true);
    if (!response.ok) return jfrogFail(id, token, false);
    const text = await response.text();
    if (leaks(text, token)) return jfrogFail(id, token, false);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jfrogFail(id, token, false);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return jfrogFail(id, token, false);
    const rec = body as Record<string, unknown>;
    if (typeof rec.repo === "string" && rec.repo !== repo) return jfrogFail(id, token, false);
    const expectedPath = `/${segments.join("/")}`;
    if (typeof rec.path === "string" && rec.path !== expectedPath)
      return jfrogFail(id, token, false);
    const size = digitText(rec.size);
    const created = cleanLine(rec.created);
    const modified = cleanLine(rec.lastModified);
    const sums = checksumLines(rec.checksums, token);
    if (!size || !created || !modified || !sums) return jfrogFail(id, token, false);
    if (leaks(size, token) || leaks(created, token) || leaks(modified, token)) {
      return jfrogFail(id, token, false);
    }
    let props: string[] = [];
    try {
      const propertiesUrl = new URL(target);
      propertiesUrl.search = "properties";
      const extra = await fetch(propertiesUrl, {
        method: "GET",
        headers,
        redirect: "error",
        signal: controller.signal,
      });
      if (extra.ok) {
        const propText = await extra.text();
        if (!leaks(propText, token)) {
          try {
            props = propertyLines(JSON.parse(propText), token);
          } catch {
            props = [];
          }
        }
      }
    } catch {
      props = [];
    }
    const lines = [
      id,
      `size: ${size}`,
      ...sums,
      `created: ${created}`,
      `lastModified: ${modified}`,
      ...props,
    ];
    if (lines.some((line) => leaks(line, token))) return jfrogFail(id, token, false);
    return ok(lines.join("\n"));
  } catch {
    return jfrogFail(id, token, false);
  } finally {
    clearTimeout(timer);
  }
}

export async function readConnector(input: {
  verb: string;
  connector: string;
  record: string;
  source?: IssueSource;
  tracker?: TrackerSource;
  actions?: ActionsSource;
  ghDeadlineMs?: number;
  jenkinsDeadlineMs?: number;
  jfrogDeadlineMs?: number;
  env?: Readonly<Record<string, string | undefined>>;
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
  if (verb === "read" && connector === "jenkins") return readJenkinsBuild(input);
  if (verb === "read" && connector === "jfrog") return readJfrogArtifact(input);
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
