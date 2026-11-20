import {
  addDecision,
  listDecisions,
  showDecision,
  showDecisionResolved,
} from "@structured-vibe-coding/core";
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

function scopeList(value: unknown): string[] | undefined {
  const raw = textArg(value);
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const add = defineCommand({
  meta: { name: "add", description: "Record a domain ruling as a decision" },
  args: {
    id: { type: "positional", description: "Decision id", required: true },
    rule: { type: "string", description: "The rule in plain words", required: true },
    scope: {
      type: "string",
      description: "Comma-separated features or modules this ruling applies to",
    },
    supersedes: { type: "string", description: "Id of the decision this one replaces" },
    why: { type: "string", description: "Why the ruling changed (when superseding)" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await addDecision(root, {
          id: args.id,
          rule: textArg(args.rule),
          scope: scopeList(args.scope),
          supersedes: textArg(args.supersedes) || undefined,
          why: textArg(args.why) || undefined,
        }),
      );
    });
  },
});

const show = defineCommand({
  meta: {
    name: "show",
    description: "Print a decision record, or resolve decision-ref lines in a file",
  },
  args: {
    id: { type: "positional", description: "Decision id", required: false },
    file: {
      type: "string",
      description: "Repo-relative path to a spec, task or test file with decision-ref lines",
    },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const file = textArg(args.file);
      if (file) {
        emit(await showDecisionResolved(root, file));
        return;
      }
      const id = textArg(args.id);
      if (!id) {
        emit({ exitCode: 1, stdout: "Pass a decision id or --file <path>." });
        return;
      }
      emit(await showDecision(root, id));
    });
  },
});

const list = defineCommand({
  meta: { name: "list", description: "List decision records" },
  args: {
    query: { type: "string", description: "Filter by words in id, rule or scope" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await listDecisions(root, textArg(args.query) || undefined));
    });
  },
});

export const decisionCmd = defineCommand({
  meta: {
    name: "decision",
    description: "Record and show domain rulings that specs, tasks and tests can link to",
  },
  subCommands: { add, show, list },
});
