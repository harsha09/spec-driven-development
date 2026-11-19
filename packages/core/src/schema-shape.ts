import "./zod-v3-messages.js";
import { z } from "zod";

type JsonSchema = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  description?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
};

/** Compact, readable shape of one JSON-schema node, for example `{"a": string, "b"?: string[]}`. */
export function shapeOf(node: JsonSchema): string {
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (node.enum) return node.enum.map((value) => JSON.stringify(value)).join(" | ");
  const variants = node.anyOf ?? node.oneOf;
  if (variants) return variants.map(shapeOf).join(" | ");
  const type = Array.isArray(node.type) ? node.type.join(" | ") : node.type;
  if (type === "array") return `${wrap(node.items ? shapeOf(node.items) : "any")}[]`;
  if (type === "object" && !node.properties && typeof node.additionalProperties === "object") {
    return `{"<key>": ${shapeOf(node.additionalProperties)}}`;
  }
  if (type === "object" || node.properties) {
    const required = new Set(node.required ?? []);
    const entries = Object.entries(node.properties ?? {}).map(
      ([key, child]) => `${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${shapeOf(child)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  if (type === "integer") return "number";
  return type ?? "any";
}

function wrap(shape: string): string {
  return shape.includes(" | ") ? `(${shape})` : shape;
}

function jsonSchemaOf(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
}

/** Shape of a zod schema, derived from the schema itself so it cannot drift from the parser. */
export function describeShape(schema: z.ZodType): string {
  return shapeOf(jsonSchemaOf(schema));
}

/** One entry per variant of a union, or one entry for any other schema, with its description. */
export function describeVariants(schema: z.ZodType): Array<{ shape: string; note: string }> {
  const node = jsonSchemaOf(schema);
  const variants = node.anyOf ?? node.oneOf ?? [node];
  return variants.map((variant) => ({ shape: shapeOf(variant), note: variant.description ?? "" }));
}

/**
 * Per-field notes of an object schema: name, shape, optional, and description. Fields of objects
 * inside arrays or objects are listed too, with a path such as `plan[].scope`.
 */
export function describeFields(
  schema: z.ZodType,
): Array<{ name: string; shape: string; optional: boolean; note: string }> {
  const out: Array<{ name: string; shape: string; optional: boolean; note: string }> = [];
  collect(jsonSchemaOf(schema), "", out);
  return out;
}

function collect(
  node: JsonSchema,
  prefix: string,
  out: Array<{ name: string; shape: string; optional: boolean; note: string }>,
): void {
  const required = new Set(node.required ?? []);
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const name = `${prefix}${key}`;
    out.push({
      name,
      shape: shapeOf(child),
      optional: !required.has(key),
      note: child.description ?? "",
    });
    if (child.type === "array" && child.items?.properties) collect(child.items, `${name}[].`, out);
    else if (child.properties) collect(child, `${name}.`, out);
  }
}
