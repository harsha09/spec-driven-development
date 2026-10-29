import { listFacts, setFact, showFact } from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { withProject } from "./project.js";

function emit(result: { exitCode: number; stdout: string }): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function textArg(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const set = defineCommand({
  meta: { name: "set", description: "Append a shared fact" },
  args: {
    key: { type: "positional", description: "Fact key", required: true },
    value: { type: "positional", description: "Fact value", required: true },
    source: { type: "string", description: "Where the fact came from" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await setFact(root, { key: args.key, value: args.value, source: textArg(args.source) }));
    });
  },
});

const get = defineCommand({
  meta: { name: "get", description: "Print the newest value for a fact" },
  args: {
    key: { type: "positional", description: "Fact key", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await showFact(root, args.key));
    });
  },
});

const list = defineCommand({
  meta: { name: "list", description: "Print the newest line for each fact" },
  args: {
    query: { type: "string", description: "Keep facts that share a word with this text" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await listFacts(root, textArg(args.query) || undefined));
    });
  },
});

export const factCmd = defineCommand({
  meta: { name: "fact", description: "Set, get, and list shared facts" },
  subCommands: { set, get, list },
});
