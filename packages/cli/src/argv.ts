import type { ArgsDef, CommandDef } from "citty";
import { commands } from "./commands.js";

/**
 * Reject unknown commands and flags before citty drops them.
 * Exit code 2 is reserved for this. A known flag still accepts its value.
 */

type Def = CommandDef<ArgsDef>;

async function resolve<T>(value: T | (() => T | Promise<T>) | Promise<T>): Promise<T> {
  return typeof value === "function" ? await (value as () => T | Promise<T>)() : await value;
}

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

const GLOBAL_FLAGS = new Set(["help", "h", "version", "v"]);

function isPlaceholder(token: string): boolean {
  return /[<[|\\]|\.\.\.|…/.test(token);
}

/** Null when argv is a real command. Otherwise the error to print. */
export async function unknownArgProblem(argv: string[]): Promise<string | null> {
  let def: Def = { subCommands: commands } as unknown as Def;
  const trail: string[] = [];
  let sawSub = true;
  let valueNext = false;

  for (const token of argv) {
    if (token === "--") break;
    if (valueNext) {
      valueNext = false;
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      const name = token.replace(/^--?/, "").split("=")[0] ?? "";
      if (GLOBAL_FLAGS.has(name)) continue;
      const names = await flagNames(def);
      if (!names.has(name) && !names.has(camel(name))) {
        const where = trail.length ? ` for "sdd ${trail.join(" ")}"` : "";
        return `Unknown flag "${token}"${where}.`;
      }
      const key = Object.keys(await argsOf(def)).find(
        (candidate) => candidate === name || camel(candidate) === camel(name),
      );
      const flagDef = key ? (await argsOf(def))[key] : undefined;
      if (flagDef?.type === "string" && !token.includes("=")) valueNext = true;
      continue;
    }

    if (isPlaceholder(token)) {
      sawSub = false;
      continue;
    }

    const subs = await subCommandsOf(def);
    if (sawSub && subs && !token.startsWith("-")) {
      const next = subs[token];
      if (next) {
        def = (await resolve(next)) as Def;
        trail.push(token);
        continue;
      }
      const takesPositional = Object.values(await argsOf(def)).some(
        (arg) => arg.type === "positional",
      );
      if (!takesPositional) {
        const where = trail.length ? ` for "sdd ${trail.join(" ")}"` : "";
        return `Unknown command "${token}"${where}.`;
      }
    }
    sawSub = false;
  }
  return null;
}

async function subCommandsOf(def: Def): Promise<Record<string, unknown> | undefined> {
  return def.subCommands
    ? ((await resolve(def.subCommands)) as Record<string, unknown>)
    : undefined;
}

async function argsOf(def: Def): Promise<ArgsDef> {
  return def.args ? ((await resolve(def.args)) as ArgsDef) : {};
}

async function flagNames(def: Def): Promise<Set<string>> {
  const names = new Set<string>();
  for (const [key, arg] of Object.entries(await argsOf(def))) {
    if (arg.type === "positional") continue;
    names.add(key);
    names.add(camel(key));
    if (key.startsWith("no-") && key.length > 3) names.add(key.slice(3));
    const aliases = (arg as { alias?: string | string[] }).alias;
    for (const alias of [aliases ?? []].flat()) names.add(alias);
    if (arg.type === "boolean") {
      names.add(`no-${key}`);
      names.add(`no${key[0]?.toUpperCase()}${key.slice(1)}`);
    }
  }
  return names;
}
