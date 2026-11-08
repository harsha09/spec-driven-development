import { z } from "zod";

/**
 * Zod 4 issue sentences, rewritten to the Zod 3 wording this CLI prints.
 * The issue object itself follows Zod 4 (see the migration guide): `received`
 * is gone, and a safe integer that does not fit in `Number` is rejected.
 */
interface Issue {
  code?: string;
  input?: unknown;
  expected?: string;
  received?: string;
  format?: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
  exact?: boolean;
  values?: unknown[];
  keys?: PropertyKey[];
  options?: unknown[];
  divisor?: number;
  issues?: Issue[];
  message?: string;
  inst?: { _zod?: { def?: { type?: string } } };
}

function parsedType(data: unknown): string {
  const type = typeof data;
  switch (type) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object": {
      if (Array.isArray(data)) return "array";
      if (data === null) return "null";
      if (
        typeof (data as { then?: unknown }).then === "function" &&
        typeof (data as { catch?: unknown }).catch === "function"
      ) {
        return "promise";
      }
      if (data instanceof Map) return "map";
      if (data instanceof Set) return "set";
      if (data instanceof Date) return "date";
      return "object";
    }
    default:
      return "unknown";
  }
}

function joinValues(values: readonly unknown[], separator = " | "): string {
  return values
    .map((value) => (typeof value === "string" ? `'${value}'` : String(value)))
    .join(separator);
}

function sizeMessage(
  kind: "small" | "big",
  origin: string | undefined,
  bound: number | bigint,
  inclusive: boolean | undefined,
  exact: boolean | undefined,
): string {
  if (origin === "array") {
    const relation = exact
      ? "exactly"
      : inclusive
        ? kind === "small"
          ? "at least"
          : "at most"
        : kind === "small"
          ? "more than"
          : "less than";
    return `Array must contain ${relation} ${bound} element(s)`;
  }
  if (origin === "string") {
    const relation = exact
      ? "exactly"
      : inclusive
        ? kind === "small"
          ? "at least"
          : "at most"
        : kind === "small"
          ? "over"
          : "under";
    return `String must contain ${relation} ${bound} character(s)`;
  }
  if (origin === "number" || origin === undefined) {
    if (kind === "small") {
      const relation = exact
        ? "exactly equal to "
        : inclusive
          ? "greater than or equal to "
          : "greater than ";
      return `Number must be ${relation}${bound}`;
    }
    const relation = exact ? "exactly" : inclusive ? "less than or equal to" : "less than";
    return `Number must be ${relation} ${bound}`;
  }
  return "Invalid input";
}

function zod3Message(issue: Issue): string | undefined {
  switch (issue.code) {
    case "invalid_type": {
      if (
        issue.expected === "int" &&
        typeof issue.input === "number" &&
        Number.isFinite(issue.input) &&
        !Number.isInteger(issue.input)
      ) {
        return "Expected integer, received float";
      }
      if (typeof issue.input === "number" && Number.isNaN(issue.input)) {
        return "Expected number, received nan";
      }
      if (
        issue.received === "Infinity" ||
        issue.received === "-Infinity" ||
        (typeof issue.input === "number" && !Number.isFinite(issue.input))
      ) {
        return "Number must be finite";
      }
      const received = parsedType(issue.input);
      if (received === "undefined") return "Required";
      const expected = issue.expected === "int" ? "integer" : issue.expected;
      return `Expected ${expected}, received ${received}`;
    }
    case "invalid_value": {
      const values = issue.values ?? [];
      if (issue.inst?._zod?.def?.type === "literal" && values.length === 1) {
        return `Invalid literal value, expected ${JSON.stringify(values[0])}`;
      }
      if (typeof issue.input !== "string") {
        if (issue.input === undefined) return "Required";
        return `Expected ${joinValues(values)}, received ${parsedType(issue.input)}`;
      }
      return `Invalid enum value. Expected ${joinValues(values)}, received '${issue.input}'`;
    }
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${joinValues(issue.keys ?? [], ", ")}`;
    case "invalid_format":
      if (issue.format === "regex") return "Invalid";
      return `Invalid ${issue.format ?? "input"}`;
    case "too_small":
      if (issue.origin === "int") return undefined;
      return sizeMessage("small", issue.origin, issue.minimum ?? 0, issue.inclusive, issue.exact);
    case "too_big":
      if (issue.origin === "int") return undefined;
      return sizeMessage("big", issue.origin, issue.maximum ?? 0, issue.inclusive, issue.exact);
    case "not_multiple_of":
      return `Number must be a multiple of ${issue.divisor}`;
    case "invalid_union":
      if (issue.options && issue.options.length > 0) {
        return `Invalid discriminator value. Expected ${joinValues(issue.options)}`;
      }
      return "Invalid input";
    case "invalid_key": {
      const inner = issue.issues?.[0];
      if (!inner) return "Invalid input";
      return zod3Message(inner) ?? inner.message ?? "Invalid input";
    }
    default:
      return undefined;
  }
}

// The English locale is installed on the first schema. Set our map after that.
z.string();
z.config({
  customError: (issue) => zod3Message(issue as Issue),
});
