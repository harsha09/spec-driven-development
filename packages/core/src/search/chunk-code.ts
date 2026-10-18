import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";
import { Language, Parser } from "web-tree-sitter";

export interface CodeChunk {
  symbol: string;
  startLine: number;
  endLine: number;
  signature: string;
  body: string;
  language: string;
}

interface TsNode {
  type: string;
  text: string;
  childCount: number;
  parent: TsNode | null;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  child: (index: number) => TsNode | null;
}

const EMIT = new Set([
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "method_definition",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "function_definition",
  "class_definition",
  "function_item",
  "struct_item",
  "enum_item",
  "trait_item",
  "impl_item",
  "mod_item",
]);

const INNER_FUNCTION = new Set(["arrow_function", "function", "function_expression"]);

const NAME_TYPES = new Set(["identifier", "property_identifier", "type_identifier"]);

const WASM_BY_EXT: Record<string, string> = {
  ".js": "tree-sitter-javascript.wasm",
  ".mjs": "tree-sitter-javascript.wasm",
  ".cjs": "tree-sitter-javascript.wasm",
  ".jsx": "tree-sitter-javascript.wasm",
  ".ts": "tree-sitter-typescript.wasm",
  ".mts": "tree-sitter-typescript.wasm",
  ".cts": "tree-sitter-typescript.wasm",
  ".tsx": "tree-sitter-tsx.wasm",
  ".py": "tree-sitter-python.wasm",
  ".rs": "tree-sitter-rust.wasm",
};

const LANG_BY_EXT: Record<string, string> = {
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "js",
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".py": "py",
  ".rs": "rs",
};

export function languageForExt(ext: string): string | null {
  return LANG_BY_EXT[ext] ?? null;
}

export function grammarForExt(ext: string): string | null {
  return WASM_BY_EXT[ext] ?? null;
}

function vendorDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "vendor", "tree-sitter"),
    join(here, "vendor", "tree-sitter"),
    join(here, "..", "..", "vendor", "tree-sitter"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

let ready: Promise<void> | null = null;
const languages = new Map<string, Language>();

async function initParser(): Promise<void> {
  if (!ready) {
    const require = createRequire(import.meta.url);
    const wasm = require.resolve("web-tree-sitter/web-tree-sitter.wasm");
    ready = Parser.init({ locateFile: () => wasm });
  }
  await ready;
}

async function loadLanguage(ext: string): Promise<Language | null> {
  const file = grammarForExt(ext);
  if (!file) return null;
  const cached = languages.get(file);
  if (cached) return cached;
  await initParser();
  const lang = await Language.load(join(vendorDir(), file));
  languages.set(file, lang);
  return lang;
}

function sourceLines(text: string): string[] {
  let normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (normalized.endsWith("\n")) normalized = normalized.slice(0, -1);
  if (!normalized) return [];
  return normalized.split("\n");
}

function startLine(node: TsNode): number {
  return node.startPosition.row + 1;
}

function endLine(node: TsNode): number {
  if (node.endPosition.column === 0 && node.endPosition.row > node.startPosition.row) {
    return node.endPosition.row;
  }
  return node.endPosition.row + 1;
}

function ownName(node: TsNode): string | null {
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    if (child && NAME_TYPES.has(child.type)) return child.text;
  }
  return null;
}

function hasChildType(node: TsNode, type: string): boolean {
  for (let i = 0; i < node.childCount; i += 1) {
    if (node.child(i)?.type === type) return true;
  }
  return false;
}

function hasDescendantType(node: TsNode, types: Set<string>): boolean {
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    if (!child) continue;
    if (types.has(child.type) || hasDescendantType(child, types)) return true;
  }
  return false;
}

function declaresFunction(node: TsNode): boolean {
  return (
    (node.type === "lexical_declaration" || node.type === "variable_declaration") &&
    hasDescendantType(node, INNER_FUNCTION)
  );
}

function insideCapturedDeclaration(node: TsNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (declaresFunction(parent)) return true;
    parent = parent.parent;
  }
  return false;
}

function classPrefix(node: TsNode): string | null {
  if (node.type === "class_declaration" || node.type === "class_definition") return null;
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === "class_declaration" ||
      parent.type === "class_definition" ||
      parent.type === "class"
    ) {
      return ownName(parent);
    }
    parent = parent.parent;
  }
  return null;
}

function spanNode(node: TsNode): TsNode {
  const parent = node.parent;
  if (!parent) return node;
  if (parent.type === "export_statement" || parent.type === "decorated_definition") return parent;
  return node;
}

function shouldEmit(node: TsNode): boolean {
  if (insideCapturedDeclaration(node)) return false;
  if (declaresFunction(node)) return true;
  if (!EMIT.has(node.type)) return false;
  if (node.type === "mod_item" && !hasChildType(node, "declaration_list")) return false;
  return true;
}

function symbolFor(node: TsNode): string {
  const name = ownName(node);
  if (node.type === "impl_item" && !name) return "(impl)";
  const prefix = classPrefix(node);
  if (prefix && name) return `${prefix}.${name}`;
  if (name) return name;
  return "(anonymous)";
}

function fileChunk(text: string, language: string): CodeChunk[] {
  const lines = sourceLines(text);
  if (!lines.length) return [];
  let signature = "(file)";
  for (const line of lines) {
    let blank = true;
    for (const ch of line) {
      const code = ch.codePointAt(0) ?? 0;
      if (code !== 32 && code !== 9) {
        blank = false;
        break;
      }
    }
    if (!blank) {
      signature = line;
      break;
    }
  }
  return [
    {
      symbol: "(file)",
      startLine: 1,
      endLine: lines.length,
      signature,
      body: lines.join("\n"),
      language,
    },
  ];
}

let parser: Parser | null = null;
let parseQueue: Promise<void> = Promise.resolve();

/** One shared Parser. Tests index files in parallel, so parse calls take turns. */
function parseSerialized(
  lang: Language,
  text: string,
): Promise<ReturnType<Parser["parse"]> | null> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = parseQueue;
  parseQueue = gate;
  return previous.then(() => {
    try {
      if (!parser) parser = new Parser();
      parser.setLanguage(lang);
      return parser.parse(text);
    } catch {
      return null;
    } finally {
      release();
    }
  });
}

export async function chunkCode(text: string, ext: string): Promise<CodeChunk[] | null> {
  if (text.includes("\0")) return null;
  const language = languageForExt(ext);
  if (!language) return null;
  const lang = await loadLanguage(ext);
  if (!lang) return null;
  const tree = await parseSerialized(lang, text);
  if (!tree) return null;
  const lines = sourceLines(text);
  const chunks: CodeChunk[] = [];
  const visit = (node: TsNode): void => {
    if (shouldEmit(node)) {
      const span = spanNode(node);
      const start = startLine(span);
      const end = endLine(span);
      if (start >= 1 && end >= start && end <= lines.length) {
        const bodyLines = lines.slice(start - 1, end);
        const signature = bodyLines[0] ?? "(anonymous)";
        chunks.push({
          symbol: symbolFor(node),
          startLine: start,
          endLine: end,
          signature,
          body: bodyLines.join("\n"),
          language,
        });
      }
    }
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(tree.rootNode as unknown as TsNode);
  if (!chunks.length) return fileChunk(text, language);
  return chunks;
}
