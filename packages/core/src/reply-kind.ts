import { appendFile } from "node:fs/promises";
import { dirname, join } from "pathe";
import type { z } from "zod";
import { type ParseReply, parseJsonObject, readWith } from "./ask.js";
import { ensureDir } from "./fs.js";

/**
 * Every reply a prompt asks for is one JSON object with a `kind`. Each prompt offers a closed
 * list of kinds. A reply in an old shape (no `kind`, or `type` in a room entry, or `step` in a
 * loop step) is still read for one minor release. `readKinded` reads both and says which old
 * shape it saw, so the caller can log it with `legacyLogger`.
 */

/** The text a question starts with once it is read: the form the run code has always used. */
export const QUESTION_PREFIX = "Question:";

/** A question as the run code stores it: one `Question:` prefix, whichever shape arrived. */
export function asQuestion(text: string): string {
  const body = text.trim();
  return body.startsWith(QUESTION_PREFIX) ? body : `${QUESTION_PREFIX} ${body}`.trim();
}

export interface KindFamily {
  /** The kinds the prompt offers. */
  kinds: readonly string[];
  /** The key an old reply used for the kind: `type` in a room entry, `step` in a loop step. */
  legacyKey?: string;
  /** The kind of an old reply that has no `kind` and no legacy key. */
  infer?: (reply: Record<string, unknown>) => string;
}

/** An old shape that was read. `shape` is `no_kind` or the old key; `kind` is the kind it became. */
export interface LegacyHit {
  shape: string;
  kind: string;
}

export type KindRead<T> = { value: T; legacy?: LegacyHit };

/** What is wrong with a kind that is missing or not offered, for example `must be a or b`. */
export function kindMessage(kinds: readonly string[]): string {
  const list =
    kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} or ${kinds[kinds.length - 1]}` : kinds[0];
  return `must be ${list}`;
}

/**
 * Put a `kind` on a reply that has none. The key an old reply used (`type`, `step`) moves to
 * `kind`; a reply with neither gets the kind `infer` gives. A reply that has a `kind` is left as it is.
 */
export function withKind(
  reply: Record<string, unknown>,
  family: KindFamily,
): { reply: Record<string, unknown>; legacy?: LegacyHit } {
  if (reply.kind !== undefined) return { reply };
  const out = { ...reply };
  const key = family.legacyKey;
  if (key !== undefined && out[key] !== undefined) {
    const kind = out[key];
    out[key] = undefined;
    out.kind = kind;
    return { reply: stripped(out), legacy: { shape: key, kind: String(kind) } };
  }
  if (family.infer) {
    const kind = family.infer(out);
    out.kind = kind;
    return { reply: out, legacy: { shape: "no_kind", kind } };
  }
  return { reply: out };
}

function stripped(reply: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(reply).filter(([, value]) => value !== undefined));
}

/**
 * A reader for a zod schema that has a `kind`. A reply in an old shape is read as the kind it
 * stands for, and the old shape is reported in `legacy`. Keys the schema does not list are dropped.
 */
export function readKinded<S extends z.ZodType>(
  schema: S,
  family: KindFamily,
  /** Tidies a reply once it has its kind, before the schema reads it. */
  prepare: (reply: Record<string, unknown>) => Record<string, unknown> = (reply) => reply,
): ParseReply<KindRead<z.output<S>>> {
  const read = readWith(schema);
  return (raw) => {
    const object = parseJsonObject(raw);
    if (!object.ok) return object;
    const { reply, legacy } = withKind(object.value, family);
    if (reply.kind === undefined)
      return { ok: false, issues: [`kind: ${kindMessage(family.kinds)}`] };
    const parsed = read(JSON.stringify(prepare(reply)));
    if (!parsed.ok) return parsed;
    return { ok: true, value: { value: parsed.value, legacy } };
  };
}

/** The log that calls with no run log of their own write to: `.sdd/role-runs/legacy-shapes.jsonl`. */
export function projectLegacyLog(root: string): string {
  return join(root, ".sdd", "role-runs", "legacy-shapes.jsonl");
}

export type NoteLegacy = (roleId: string, hit: LegacyHit) => Promise<void>;

/**
 * Writes a `legacy_shape` line to `file` the first time each old shape is seen. `kind` is the kind
 * of the first reply that used the shape. Make one for each
 * run, so a run logs each old shape once however many replies use it. `stamp` adds the time, for a
 * log that is shared by many runs.
 */
export function legacyLogger(file: string, options: { stamp?: () => string } = {}): NoteLegacy {
  const seen = new Set<string>();
  return async (roleId, hit) => {
    if (seen.has(hit.shape)) return;
    seen.add(hit.shape);
    await ensureDir(dirname(file));
    const line: Record<string, unknown> = { type: "legacy_shape", roleId, ...hit };
    if (options.stamp) line.ts = options.stamp();
    await appendFile(file, `${JSON.stringify(line)}\n`, "utf8");
  };
}
