import { appendFile } from "node:fs/promises";
import { join } from "pathe";
import { buildContext, getActiveChangeId } from "../change-context.js";
import { loadConfig } from "../config.js";
import { pathExists, readText, writeText } from "../fs.js";
import { getHeadSha } from "../git-head.js";
import { nowIso } from "../slug.js";
import { gitUserName, readTeamConfig } from "./team.js";
import type { RoleCommandResult } from "./types.js";

function ok(stdout: string): RoleCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): RoleCommandResult {
  return { exitCode: 1, stdout };
}

function oneLine(
  note: string | undefined,
  empty: string,
  broken: string,
): string | RoleCommandResult {
  const raw = note ?? "";
  if (raw.includes("\n") || raw.includes("\r")) return fail(broken);
  const words = raw.trim();
  if (!words) return fail(empty);
  return words;
}

function safeStageId(stage: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(stage);
}

export function signoffFileName(stage: string, sha: string): string {
  return `reviews/${stage}-${sha}.md`;
}

interface SignoffRecord {
  kind: string;
  sha: string;
  reviewer: string;
  verdict: string;
  evidence: string;
}

function renderSignoff(record: SignoffRecord): string {
  return [
    "---",
    `kind: ${record.kind}`,
    `sha: ${record.sha}`,
    `reviewer: ${record.reviewer}`,
    `verdict: ${record.verdict}`,
    "---",
    record.evidence,
    "",
  ].join("\n");
}

function parseSignoff(raw: string): SignoffRecord | null {
  const lines = raw.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end <= 1) return null;
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const split = line.indexOf(":");
    if (split <= 0) return null;
    fields.set(line.slice(0, split).trim(), line.slice(split + 1).trim());
  }
  const kind = fields.get("kind") ?? "";
  const sha = fields.get("sha") ?? "";
  const reviewer = fields.get("reviewer") ?? "";
  const verdict = fields.get("verdict") ?? "";
  const evidence = lines
    .slice(end + 1)
    .join("\n")
    .trim();
  if (!kind || !sha || !reviewer || !verdict || !evidence) return null;
  return { kind, sha, reviewer, verdict, evidence };
}

async function headSha(root: string): Promise<string | RoleCommandResult> {
  try {
    const sha = await getHeadSha(root);
    if (!sha) return fail("Cannot sign off: Git HEAD is unavailable in this project.");
    return sha;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git HEAD is unavailable.";
    return fail(message);
  }
}

async function openChange(
  root: string,
  change: string | undefined,
): Promise<{ path: string; stage: string } | RoleCommandResult> {
  const config = await loadConfig(root);
  const requested = change?.trim() ?? "";
  const changeId = requested || (await getActiveChangeId(root, config));
  if (!changeId) return fail("No active change.");
  try {
    const ctx = await buildContext(root, config, changeId);
    return { path: ctx.path, stage: ctx.meta.stage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Change not found.";
    return fail(message);
  }
}

function isFailure(value: object): value is RoleCommandResult {
  return "exitCode" in value;
}

export async function recordSignoff(
  root: string,
  input: { note?: string; stage?: string; change?: string },
): Promise<RoleCommandResult> {
  const words = oneLine(input.note, "A sign-off needs a note.", "A sign-off note is one line.");
  if (typeof words !== "string") return words;
  const opened = await openChange(root, input.change);
  if (isFailure(opened)) return opened;
  const stage = (input.stage?.trim() || opened.stage).trim();
  if (!safeStageId(stage)) return fail("A stage id is not valid.");
  const team = await readTeamConfig(root);
  if ("error" in team) return fail(team.error);
  const sha = await headSha(root);
  if (typeof sha !== "string") return sha;
  const gitUser = gitUserName(root);
  if (!gitUser) return fail("Git user.name is not set.");
  if (!team.team.humans.some((human) => human.name === gitUser)) {
    return fail("Git user.name is not a human approver.");
  }
  const file = join(opened.path, signoffFileName(stage, sha));
  const existing = (await pathExists(file)) ? parseSignoff(await readText(file)) : null;
  const same =
    existing !== null &&
    existing.kind === stage &&
    existing.sha === sha &&
    existing.reviewer === gitUser &&
    existing.verdict === "accept";
  if (!same) {
    await writeText(
      file,
      renderSignoff({ kind: stage, sha, reviewer: gitUser, verdict: "accept", evidence: words }),
    );
  }
  await appendFile(
    join(opened.path, "decisions.md"),
    `${nowIso()} sign-off ${stage} ${sha} ${gitUser} accept ${words}\n`,
  );
  return ok(`Signed ${stage} at ${sha}.`);
}

export async function recordDecisionRequest(
  root: string,
  input: { note?: string; change?: string },
): Promise<RoleCommandResult> {
  const words = oneLine(input.note, "A decision needs a note.", "A decision note is one line.");
  if (typeof words !== "string") return words;
  const opened = await openChange(root, input.change);
  if (isFailure(opened)) return opened;
  await appendFile(join(opened.path, "decisions.md"), `${nowIso()} decision-needed ${words}\n`);
  return ok("Decision needed.");
}

/** A human hard gate opens only for a listed person's accept at this HEAD. */
export async function checkHumanSignoff(
  root: string,
  changePath: string,
  stageId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!safeStageId(stageId)) return { ok: false, message: "A stage id is not valid." };
  const team = await readTeamConfig(root);
  if ("error" in team) return { ok: false, message: team.error };
  let sha: string | null;
  try {
    sha = await getHeadSha(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git HEAD is unavailable.";
    return { ok: false, message };
  }
  if (!sha) {
    return {
      ok: false,
      message: `Cannot leave stage "${stageId}": Git HEAD is unavailable, so a human sign-off cannot be checked.`,
    };
  }
  const file = join(changePath, signoffFileName(stageId, sha));
  if (!(await pathExists(file))) {
    return {
      ok: false,
      message: `Hard gate on stage "${stageId}" needs a human sign-off for this commit. Run \`sdd team signoff\`.`,
    };
  }
  const parsed = parseSignoff(await readText(file));
  const listed =
    parsed !== null &&
    parsed.kind === stageId &&
    parsed.sha === sha &&
    parsed.verdict === "accept" &&
    team.team.humans.some((human) => human.name === parsed.reviewer);
  if (!listed) {
    return { ok: false, message: `Sign-off for stage "${stageId}" does not match this commit.` };
  }
  return { ok: true };
}
