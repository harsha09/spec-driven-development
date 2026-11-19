import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type KindFamily,
  QUESTION_PREFIX,
  asQuestion,
  kindMessage,
  legacyLogger,
  readKinded,
  withKind,
} from "../reply-kind.js";
import {
  CRITIQUE_FAMILY,
  DRAFT_FAMILY,
  DRAFT_KINDS,
  GUIDE_FAMILY,
  MODEL_ROOM_TYPES,
  PLAN_FAMILY,
  REVISION_FAMILY,
  ROOM_FAMILY,
} from "../reply-schemas.js";
import { LOOP_FAMILY, LOOP_KINDS } from "../team/loop-contract.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("withKind", () => {
  it("leaves a reply that has a kind as it is", () => {
    const reply = { kind: "draft", text: "x" };
    expect(withKind(reply, DRAFT_FAMILY)).toEqual({ reply });
  });

  it("gives a reply with no kind the kind the family infers, and reports no_kind", () => {
    expect(withKind({ text: "x" }, DRAFT_FAMILY)).toEqual({
      reply: { text: "x", kind: "draft" },
      legacy: { shape: "no_kind", kind: "draft" },
    });
    expect(withKind({ text: `${QUESTION_PREFIX} Which?` }, DRAFT_FAMILY).reply.kind).toBe(
      "question",
    );
    expect(withKind({ text: "x" }, CRITIQUE_FAMILY).reply.kind).toBe("critique");
    expect(withKind({ text: "x" }, REVISION_FAMILY).reply.kind).toBe("revision");
    expect(withKind({ text: "x" }, PLAN_FAMILY).reply.kind).toBe("plan_tree");
    expect(withKind({ text: "x" }, GUIDE_FAMILY).reply.kind).toBe("draft");
  });

  it("moves an old type or step to kind, and reports the old key", () => {
    expect(withKind({ type: "objection", text: "x" }, ROOM_FAMILY)).toEqual({
      reply: { kind: "objection", text: "x" },
      legacy: { shape: "type", kind: "objection" },
    });
    expect(withKind({ step: "plan", items: [] }, LOOP_FAMILY)).toEqual({
      reply: { kind: "plan", items: [] },
      legacy: { shape: "step", kind: "plan" },
    });
  });

  it("does not guess a kind for a family with no old shape to infer", () => {
    expect(withKind({ text: "x" }, ROOM_FAMILY).reply.kind).toBeUndefined();
    expect(withKind({ text: "x" }, LOOP_FAMILY).reply.kind).toBeUndefined();
  });
});

describe("readKinded", () => {
  const family: KindFamily = { kinds: ["a", "b"], infer: () => "a" };
  const schema = z.object({
    kind: z.enum(["a", "b"], { error: kindMessage(["a", "b"]) }),
    text: z.string(),
  });
  const read = readKinded(schema, family);

  it("reads a kind, an old reply, and a fenced reply", () => {
    expect(read('{"kind":"b","text":"x"}')).toEqual({
      ok: true,
      value: { value: { kind: "b", text: "x" }, legacy: undefined },
    });
    expect(read('{"text":"x"}')).toEqual({
      ok: true,
      value: { value: { kind: "a", text: "x" }, legacy: { shape: "no_kind", kind: "a" } },
    });
    expect(read('```json\n{"kind":"a","text":"x"}\n```').ok).toBe(true);
  });

  it("names the kinds on a kind that is not offered", () => {
    expect(read('{"kind":"c","text":"x"}')).toEqual({
      ok: false,
      issues: ["kind: must be a or b"],
    });
    expect(read("not json")).toEqual({ ok: false, issues: ["(reply): not one JSON object"] });
  });
});

describe("asQuestion", () => {
  it("adds one prefix", () => {
    expect(asQuestion("Which list?")).toBe("Question: Which list?");
    expect(asQuestion("Question: Which list?")).toBe("Question: Which list?");
    expect(asQuestion("  Which list?  ")).toBe("Question: Which list?");
  });
});

describe("legacyLogger", () => {
  it("writes each old shape once per logger, and a new logger starts again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdd-kind-"));
    temps.push(dir);
    const file = join(dir, "nested", "run.jsonl");
    const run = legacyLogger(file);
    await run("builder", { shape: "no_kind", kind: "draft" });
    await run("builder", { shape: "no_kind", kind: "critique" });
    await run("critic", { shape: "step", kind: "plan" });
    const lines = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { type: "legacy_shape", roleId: "builder", shape: "no_kind", kind: "draft" },
      { type: "legacy_shape", roleId: "critic", shape: "step", kind: "plan" },
    ]);
    await legacyLogger(file)("builder", { shape: "no_kind", kind: "draft" });
    expect((await readFile(file, "utf8")).trim().split("\n")).toHaveLength(3);
  });

  it("adds a time when the log is shared", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdd-kind-"));
    temps.push(dir);
    const file = join(dir, "legacy.jsonl");
    await legacyLogger(file, { stamp: () => "2026-11-19T00:00:00.000Z" })("x", {
      shape: "type",
      kind: "post",
    });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      type: "legacy_shape",
      roleId: "x",
      shape: "type",
      kind: "post",
      ts: "2026-11-19T00:00:00.000Z",
    });
  });
});

describe("the maintainers page and the changelog", () => {
  const offered = [
    ...DRAFT_KINDS,
    "critique",
    "revision",
    ...MODEL_ROOM_TYPES,
    ...LOOP_KINDS,
    "plan_tree",
  ];

  it("lists every kind a prompt offers", async () => {
    const page = await readFile(join(root, "docs/maintainers/prompts.md"), "utf8");
    for (const kind of new Set(offered)) expect(page).toContain(`| \`${kind}\` |`);
  });

  it("explains the old shapes and the legacy_shape line", async () => {
    const page = await readFile(join(root, "docs/maintainers/prompts.md"), "utf8");
    expect(page).toContain("legacy_shape");
    expect(page).toContain("legacy-shapes.jsonl");
    for (const shape of ["no_kind", "type", "step"]) expect(page).toContain(`\`${shape}\``);
  });

  it("notes the compatibility window in the changelog", async () => {
    const log = await readFile(join(root, "CHANGELOG.md"), "utf8");
    expect(log).toContain("Compatibility window");
    expect(log).toContain("one minor release");
    expect(log).toContain("legacy_shape");
  });
});
