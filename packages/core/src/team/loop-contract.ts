import "../zod-v3-messages.js";
import { z } from "zod";
import { PROMPT_TEXT, type ReplyExamples, renderExamples } from "../prompt.js";
import type { KindFamily } from "../reply-kind.js";
import { describeFields, describeVariants } from "../schema-shape.js";

const planStep = z
  .strictObject({ kind: z.literal("plan"), items: z.array(z.string()) })
  .describe("Write down the steps you will take. Plan before you act.");
const toolStep = z
  .strictObject({
    kind: z.literal("tool"),
    name: z.string().min(1),
    args: z.unknown().optional(),
  })
  .describe("Call one tool from the tool list. Its result comes back on the next turn.");
const checkStep = z
  .strictObject({
    kind: z.literal("check"),
    claim: z.string().min(1),
    evidence: z.array(z.string()).optional(),
  })
  .describe("State a claim about the work. A claim that something passes needs evidence.");
const askStep = z
  .strictObject({
    kind: z.literal("ask"),
    question: z.string().min(1),
    options: z.array(z.string()),
    suggest: z.string().optional(),
  })
  .describe("Stop and ask the person one question. Use it when you are blocked or unsure.");
const doneStep = z
  .strictObject({
    kind: z.literal("done"),
    summary: z.string(),
    outputs: z.array(z.string()),
    evidence: z.array(z.string()).optional(),
  })
  .describe("Finish the work. List the files you produced in outputs.");

export const LoopStepSchema = z.discriminatedUnion("kind", [
  planStep,
  toolStep,
  checkStep,
  askStep,
  doneStep,
]);

export type LoopStep = z.infer<typeof LoopStepSchema>;

/** The kinds a loop prompt offers. An old reply named its kind `step`. */
export const LOOP_KINDS = ["plan", "tool", "check", "ask", "done"] as const;
export const LOOP_FAMILY: KindFamily = { kinds: LOOP_KINDS, legacyKey: "step" };

export interface ToolSpec {
  name: string;
  description: string;
  args: z.ZodType;
}

/** One valid reply per step, and one the parser refuses. Tests parse them with the schema. */
export const LOOP_STEP_EXAMPLES: ReplyExamples = {
  valid: [
    { kind: "plan", items: ["Read the spec", "Add the retry", "Run the tests"] },
    { kind: "tool", name: "read_file", args: { path: "changes/refund-retry/spec.md" } },
    {
      kind: "check",
      claim: "Refund calls retry 3 times and the tests pass.",
      evidence: ["changes/refund-retry/evidence/0a1b2c3.json"],
    },
    {
      kind: "ask",
      question: "Should a retry also cover timeouts?",
      options: ["yes", "no"],
      suggest: "yes",
    },
    {
      kind: "done",
      summary: "Refund calls retry 3 times, 2 seconds apart. Tests pass.",
      outputs: ["src/refund/client.ts"],
      evidence: ["changes/refund-retry/evidence/0a1b2c3.json"],
    },
  ],
  invalid: {
    value: { kind: "read_file", path: "changes/refund-retry/spec.md" },
    why: 'kind must be plan, tool, check, ask or done. A tool call is {"kind":"tool","name":"read_file","args":{...}}.',
  },
};

/** The reply format for the loop, generated from the step schema the parser uses. */
export function renderLoopContract(input: { steps?: z.ZodType } = {}): string {
  const lines: string[] = [
    PROMPT_TEXT.replyIntro.replace(
      "Shape:",
      "Send one step per reply. The kind of the step is one of:",
    ),
  ];
  for (const variant of describeVariants(input.steps ?? LoopStepSchema)) {
    lines.push(`- ${variant.shape}${variant.note ? `  ${variant.note}` : ""}`);
  }
  lines.push(PROMPT_TEXT.optionalKeys, ...renderExamples(LOOP_STEP_EXAMPLES));
  return lines.join("\n");
}

/**
 * The tools a role may call, for the Scope section. Generated from the registered tool specs, so
 * the list cannot drift from what `runTool` dispatches.
 */
export function renderToolList(input: {
  tools: readonly ToolSpec[];
  /** Exact commands `run_check` accepts in this project. */
  checks?: readonly string[];
}): string[] {
  const lines: string[] = [
    'Tools you may call, one per "tool" step. Send {"kind":"tool","name":<name>,"args":{...}}:',
  ];
  for (const tool of input.tools) {
    lines.push(`- ${tool.name}: ${tool.description}`);
    for (const field of describeFields(tool.args)) {
      const note = field.note ? ` ${field.note}` : "";
      lines.push(`    ${field.name}${field.optional ? "?" : ""}: ${field.shape}.${note}`);
    }
  }
  lines.push(
    "A person does these: push, pull request, merge, tag, deploy. A call to them is refused.",
  );
  if (input.checks && input.checks.length > 0) {
    lines.push("run_check accepts only these exact commands:");
    for (const command of input.checks) lines.push(`    ${command}`);
  }
  return lines;
}
