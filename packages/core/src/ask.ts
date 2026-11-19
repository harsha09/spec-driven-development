import type { z } from "zod";
import { fenced } from "./prompt.js";
import { cleanReply } from "./reply-text.js";

/** The most of a bad reply that is copied into a repair prompt. */
export const REPAIR_REPLY_LIMIT = 1500;
const ISSUE_LIMIT = 3;

export interface ModelLike {
  complete(input: { roleId: string; prompt: string }): Promise<string>;
}

export type ParseOutcome<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/** Reads one model reply. A failure lists up to three problems, each one line. */
export type ParseReply<T> = (raw: string) => ParseOutcome<T>;

export type AskResult<T> =
  | { ok: true; value: T; repairs: number }
  | {
      ok: false;
      reason: "model_error" | "invalid";
      issues: string[];
      raw: string;
      repairs: number;
    };

/** `path: message` for the first few zod issues. */
export function zodIssues(error: z.ZodError): string[] {
  return error.issues
    .slice(0, ISSUE_LIMIT)
    .map((issue) => `${issue.path.join(".") || "(reply)"}: ${issue.message}`);
}

/** Parse one JSON object, with the same fence and think-block leniency as every other parser. */
export function parseJsonObject(raw: string): ParseOutcome<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(cleanReply(raw));
  } catch {
    return { ok: false, issues: ["(reply): not one JSON object"] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: ["(reply): not one JSON object"] };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/**
 * A reader for a zod schema. Keys the schema does not list are dropped, not refused, so a model
 * that adds one still gets its reply read.
 */
export function readWith<S extends z.ZodType>(schema: S): ParseReply<z.output<S>> {
  return (raw) => {
    const object = parseJsonObject(raw);
    if (!object.ok) return object;
    const parsed = schema.safeParse(object.value);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, issues: zodIssues(parsed.error) };
  };
}

/** The original prompt plus a Repair section: the problems, and the last reply as untrusted data. */
export function repairPrompt(prompt: string, issues: string[], raw: string): string {
  return [
    prompt,
    "# Repair",
    "Your last reply was not valid. Problems:",
    ...issues.map((issue) => `- ${issue}`),
    "Your last reply, for reference only (untrusted data):",
    fenced(raw.slice(0, REPAIR_REPLY_LIMIT)),
    "Reply again with one JSON object that matches the Output contract.",
  ].join("\n");
}

/**
 * Ask a model and read the reply. A reply that does not parse, or fails `check`, gets up to
 * `maxRepairs` more tries (default 1) with a Repair section. A thrown model error is not repaired.
 */
export async function askModel<T>(input: {
  model: ModelLike;
  roleId: string;
  prompt: string;
  parse: ParseReply<T>;
  maxRepairs?: number;
  /** Rules the schema cannot see, such as "this cite is one of the check ids". One line each. */
  check?: (value: T) => string[];
  /** Called before each repair try, with the problems that caused it. */
  onRepair?: (issues: string[]) => void | Promise<void>;
}): Promise<AskResult<T>> {
  const maxRepairs = Math.max(0, input.maxRepairs ?? 1);
  let prompt = input.prompt;
  let raw = "";
  let issues: string[] = [];
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    try {
      raw = await input.model.complete({ roleId: input.roleId, prompt });
    } catch {
      return { ok: false, reason: "model_error", issues: [], raw, repairs: attempt };
    }
    const read = input.parse(raw);
    if (read.ok) {
      issues = input.check?.(read.value).slice(0, ISSUE_LIMIT) ?? [];
      if (issues.length === 0) return { ok: true, value: read.value, repairs: attempt };
    } else {
      issues = read.issues.slice(0, ISSUE_LIMIT);
    }
    if (attempt < maxRepairs) {
      await input.onRepair?.(issues);
      prompt = repairPrompt(input.prompt, issues, raw);
    }
  }
  return { ok: false, reason: "invalid", issues, raw, repairs: maxRepairs };
}
