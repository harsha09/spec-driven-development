import "../zod-v3-messages.js";
import { z } from "zod";
import { describeFields, describeVariants } from "../schema-shape.js";

const planStep = z
  .strictObject({ step: z.literal("plan"), items: z.array(z.string()) })
  .describe("Write down the steps you will take. Plan before you act.");
const toolStep = z
  .strictObject({
    step: z.literal("tool"),
    name: z.string().min(1),
    args: z.unknown().optional(),
  })
  .describe("Call one tool from the tool list. Its result comes back on the next turn.");
const checkStep = z
  .strictObject({
    step: z.literal("check"),
    claim: z.string().min(1),
    evidence: z.array(z.string()).optional(),
  })
  .describe("State a claim about the work. A claim that something passes needs evidence.");
const askStep = z
  .strictObject({
    step: z.literal("ask"),
    question: z.string().min(1),
    options: z.array(z.string()),
    suggest: z.string().optional(),
  })
  .describe("Stop and ask the person one question. Use it when you are blocked or unsure.");
const doneStep = z
  .strictObject({
    step: z.literal("done"),
    summary: z.string(),
    outputs: z.array(z.string()),
    evidence: z.array(z.string()).optional(),
  })
  .describe("Finish the work. List the files you produced in outputs.");

export const LoopStepSchema = z.discriminatedUnion("step", [
  planStep,
  toolStep,
  checkStep,
  askStep,
  doneStep,
]);

export type LoopStep = z.infer<typeof LoopStepSchema>;

export interface ToolSpec {
  name: string;
  description: string;
  args: z.ZodType;
}

export interface LoopContractInput {
  steps?: z.ZodType;
  tools: readonly ToolSpec[];
  /** Exact commands `run_check` accepts in this project. */
  checks?: readonly string[];
}

/** A reply the parser accepts. Tests parse it with the schema, so it cannot go stale. */
export const VALID_STEP_EXAMPLE: LoopStep = {
  step: "tool",
  name: "read_file",
  args: { path: "src/index.ts" },
};

/** A reply the parser refuses: a step name that does not exist, plus prose around it. */
export const INVALID_STEP_EXAMPLE = '{"step":"think","text":"I will look at the file."}';

/**
 * The reply format and tool list that go to the model. Both are generated from the loop's
 * zod schema and the registered tool specs, so a change to either changes this text.
 */
export function renderLoopContract(input: LoopContractInput): string {
  const lines: string[] = [
    "Reply format:",
    "Reply with exactly one JSON object per turn. No prose, no code fences. The object is one of:",
  ];
  for (const variant of describeVariants(input.steps ?? LoopStepSchema)) {
    lines.push(`- ${variant.shape}${variant.note ? `  ${variant.note}` : ""}`);
  }
  lines.push(
    "Optional keys end in ?. A reply that does not match one of these is refused and the run stops.",
    `Valid: ${JSON.stringify(VALID_STEP_EXAMPLE)}`,
    `Invalid: ${INVALID_STEP_EXAMPLE} (no such step)`,
    "",
    "Tool list:",
    'Call a tool with {"step":"tool","name":<name>,"args":{...}}. Results appear under "Tools:" on the next turn.',
  );
  for (const tool of input.tools) {
    lines.push(`- ${tool.name}: ${tool.description}`);
    for (const field of describeFields(tool.args)) {
      const note = field.note ? ` ${field.note}` : "";
      lines.push(`    ${field.name}${field.optional ? "?" : ""}: ${field.shape}.${note}`);
    }
  }
  lines.push("Push, pull request, and merge are not tools. A person does those.");
  if (input.checks && input.checks.length > 0) {
    lines.push("run_check accepts only these exact commands:");
    for (const command of input.checks) lines.push(`    ${command}`);
  }
  return lines.join("\n");
}
