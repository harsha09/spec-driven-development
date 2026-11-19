import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArgsDef, CommandDef } from "citty";
import { describe, expect, it } from "vitest";
import { commands } from "../commands.js";

/**
 * Every `sdd ...` command shown in the README and docs/ must name a real command and use only
 * flags that command really has. Docs drift quietly otherwise.
 */

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

type Def = CommandDef<ArgsDef>;

async function resolve<T>(value: T | (() => T | Promise<T>) | Promise<T>): Promise<T> {
  return typeof value === "function" ? await (value as () => T | Promise<T>)() : await value;
}

async function subCommandsOf(def: Def): Promise<Record<string, unknown> | undefined> {
  return def.subCommands
    ? ((await resolve(def.subCommands)) as Record<string, unknown>)
    : undefined;
}

async function argsOf(def: Def): Promise<ArgsDef> {
  return def.args ? ((await resolve(def.args)) as ArgsDef) : {};
}

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

async function markdownFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "public" || entry.name === "node_modules") continue;
      await markdownFiles(full, out);
    } else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of text.matchAll(re)) tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  return tokens;
}

const SDD_LINE =
  /^\s*(?:\$\s+)?(?:[A-Z_]+=(?:"[^"]*"|'[^']*'|\S+)\s+)*(?:pnpm\s+sdd|npx\s+(?:-y\s+)?@structured-vibe-coding\/cli|sdd)\s+(.*)$/;

interface Shown {
  file: string;
  line: number;
  text: string;
}

/** The command lines in fenced code blocks, and the `sdd ...` spans in prose. */
function shownCommands(file: string, source: string): Shown[] {
  const found: Shown[] = [];
  const lines = source.split(/\r?\n/);
  let fence: string | null = null;
  let carry: Shown | null = null;
  lines.forEach((raw, index) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(raw);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "";
      if (fence === null) fence = marker;
      else if (marker.startsWith(fence)) fence = null;
      carry = null;
      return;
    }
    if (fence !== null) {
      let text = raw;
      if (carry) {
        carry.text += ` ${text.trim()}`;
        if (!text.trimEnd().endsWith("\\")) carry = null;
        else carry.text = carry.text.replace(/\\\s*$/, "");
        return;
      }
      const match = SDD_LINE.exec(text);
      if (!match) return;
      text = match[1] ?? "";
      const entry: Shown = { file, line: index + 1, text: text.replace(/\\\s*$/, "") };
      found.push(entry);
      if (text.trimEnd().endsWith("\\")) carry = entry;
      return;
    }
    for (const span of raw.matchAll(/`([^`]+)`/g)) {
      const match = /^(?:pnpm\s+sdd|sdd)\s+(.*)$/.exec((span[1] ?? "").trim());
      if (match) found.push({ file, line: index + 1, text: match[1] ?? "" });
    }
  });
  return found;
}

async function check(shown: Shown): Promise<string | null> {
  // A pipe, redirect, comment or && ends the sdd command.
  const text = shown.text.split(/\s+(?:\||&&|;|>|#)\s*/)[0] ?? "";
  const tokens = tokenize(text);
  let def: Def = { subCommands: commands } as unknown as Def;
  const trail: string[] = [];
  let sawSub = true;
  let valueNext = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    // Placeholders and prose such as "list|start" or "list/add/remove" are not one command.
    if (/[<[|\\]|\.\.\.|…/.test(token) || (sawSub && trail.length > 0 && token.includes("/")))
      break;
    const subs = await subCommandsOf(def);
    if (sawSub && subs && !token.startsWith("-")) {
      const next = subs[token];
      if (next) {
        def = (await resolve(next)) as Def;
        trail.push(token);
        continue;
      }
      const args = await argsOf(def);
      const takesPositional = Object.values(args).some((arg) => arg.type === "positional");
      if (!takesPositional && trail.length > 0) {
        return `${shown.file}:${shown.line} "sdd ${text}" – "${token}" is not a subcommand of "sdd ${trail.join(" ")}" (has: ${Object.keys(subs).join(", ")})`;
      }
      if (trail.length === 0) {
        return `${shown.file}:${shown.line} "sdd ${text}" – "${token}" is not an sdd command`;
      }
    }
    sawSub = false;
    if (valueNext) {
      valueNext = false;
      continue;
    }
    if (token.startsWith("-")) {
      const name = token.replace(/^--?/, "").split("=")[0] ?? "";
      if (["help", "h", "version", "v"].includes(name)) continue;
      const args = await argsOf(def);
      const names = new Set<string>();
      for (const [key, arg] of Object.entries(args)) {
        if (arg.type === "positional") continue;
        names.add(key);
        names.add(camel(key));
        const aliases = (arg as { alias?: string | string[] }).alias;
        for (const alias of [aliases ?? []].flat()) names.add(alias);
        if (arg.type === "boolean") {
          names.add(`no-${key}`);
          names.add(`no${key[0]?.toUpperCase()}${key.slice(1)}`);
        }
      }
      const key = [...Object.keys(await argsOf(def))].find(
        (candidate) => candidate === name || camel(candidate) === camel(name),
      );
      const flagDef = key ? (await argsOf(def))[key] : undefined;
      // A string flag takes the next token as its value, even when that starts with "-".
      if (flagDef?.type === "string" && !token.includes("=")) valueNext = true;
      if (!names.has(name) && !names.has(camel(name))) {
        return `${shown.file}:${shown.line} "sdd ${text}" – "${token}" is not a flag of "sdd ${trail.join(" ")}" (has: ${[...names].join(", ")})`;
      }
    }
  }
  return null;
}

describe("the docs checker", () => {
  const at = (text: string): Shown => ({ file: "x.md", line: 1, text });

  it("accepts real commands and flags", async () => {
    expect(await check(at('new "Title" -w hotfix -y --no-agent'))).toBeNull();
    expect(await check(at("mcp sources add --id a --command npx --arg -y"))).toBeNull();
  });

  it("rejects a command, a subcommand, and a flag that do not exist", async () => {
    expect(await check(at("frobnicate"))).toContain("not an sdd command");
    expect(await check(at("mcp sources frobnicate"))).toContain("not a subcommand");
    expect(await check(at("next --frobnicate"))).toContain("not a flag");
  });
});

describe("commands shown in the docs", () => {
  it("finds the commands the docs show", async () => {
    const files = [join(repo, "README.md"), ...(await markdownFiles(join(repo, "docs")))];
    let count = 0;
    for (const file of files) {
      count += shownCommands(relative(repo, file), await readFile(file, "utf8")).length;
    }
    expect(count).toBeGreaterThan(50);
  });

  it("only shows sdd commands and flags that exist", async () => {
    const files = [join(repo, "README.md"), ...(await markdownFiles(join(repo, "docs")))];
    const problems: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const shown of shownCommands(relative(repo, file), source)) {
        const problem = await check(shown);
        if (problem) problems.push(problem);
      }
    }
    expect(problems).toEqual([]);
  });
});
