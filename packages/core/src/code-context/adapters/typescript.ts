/**
 * TypeScript/JavaScript LanguageAdapter using the TypeScript Compiler API.
 *
 * Packaging (research §4.2 / ARB #5):
 * - `typescript` is a **runtime dependency** of @structured-vibe-coding/core.
 * - Dual TypeScript copies in consumer monorepos are intentional isolation:
 *   this adapter uses core's own `typescript` for syntactic `createSourceFile`
 *   only. It never loads the host project's TypeScript instance or merges a
 *   full Program / typechecker.
 */

import ts from "typescript";
import { extname } from "pathe";
import type { SymbolInfo, SymbolKind } from "../types.js";
import type { AdapterExtractResult, LanguageAdapter } from "./types.js";

export const TS_JS_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
] as const;

function scriptKindForPath(filePath: string): ts.ScriptKind {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    case ".cts":
    case ".mts":
    case ".ts":
    default:
      return ts.ScriptKind.TS;
  }
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1; // 1-based
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * True when the declaration is at module/source-file scope (not nested in a function/class body).
 */
function isTopLevel(node: ts.Node, sf: ts.SourceFile): boolean {
  let p: ts.Node | undefined = node.parent;
  while (p && p !== sf) {
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isConstructorDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p)
    ) {
      return false;
    }
    // Nested class/interface bodies are still "structural" top-level for methods —
    // but we only call this on declarations we already selected as module-level.
    if (ts.isClassDeclaration(p) || ts.isClassExpression(p)) {
      return false;
    }
    p = p.parent;
  }
  return true;
}

function extractFromSource(
  filePath: string,
  source: string,
  repoRelativePath: string,
): AdapterExtractResult {
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    scriptKindForPath(filePath),
  );

  const symbols: SymbolInfo[] = [];
  const imports: { from: string; names?: string[] }[] = [];
  const exports: { name: string; kind?: string }[] = [];
  const references: { name: string; line: number }[] = [];

  const pushSymbol = (
    name: string,
    node: ts.Node,
    kind: SymbolKind,
    exported: boolean,
  ) => {
    if (!name) return;
    symbols.push({
      name,
      kind,
      filePath: repoRelativePath,
      startLine: lineOf(sf, node.getStart(sf, false)),
      endLine: lineOf(sf, node.getEnd()),
      exported,
    });
    if (exported) {
      exports.push({ name, kind });
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec)) {
        const names: string[] = [];
        const clause = node.importClause;
        if (clause?.name) names.push(clause.name.text);
        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            names.push(clause.namedBindings.name.text);
          } else if (ts.isNamedImports(clause.namedBindings)) {
            for (const el of clause.namedBindings.elements) {
              names.push(el.name.text);
            }
          }
        }
        imports.push({ from: spec.text, names: names.length ? names : undefined });
      }
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      // re-export from
      imports.push({ from: node.moduleSpecifier.text, names: ["*"] });
    }

    if (ts.isFunctionDeclaration(node) && node.name && isTopLevel(node, sf)) {
      pushSymbol(node.name.text, node, "function", hasExportModifier(node));
    }

    if (ts.isClassDeclaration(node) && node.name && isTopLevel(node, sf)) {
      pushSymbol(node.name.text, node, "class", hasExportModifier(node));
    }

    if (ts.isInterfaceDeclaration(node) && isTopLevel(node, sf)) {
      pushSymbol(node.name.text, node, "interface", hasExportModifier(node));
    }

    if (ts.isTypeAliasDeclaration(node) && isTopLevel(node, sf)) {
      pushSymbol(node.name.text, node, "type", hasExportModifier(node));
    }

    if (ts.isEnumDeclaration(node) && isTopLevel(node, sf)) {
      pushSymbol(node.name.text, node, "type", hasExportModifier(node));
    }

    // export const foo = … / const foo = () => …
    if (ts.isVariableStatement(node) && isTopLevel(node, sf)) {
      const exported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        const init = decl.initializer;
        const isFn =
          init &&
          (ts.isArrowFunction(init) ||
            ts.isFunctionExpression(init));
        // Prefer exported or function-like bindings; skip local noise
        if (exported || isFn) {
          pushSymbol(name, decl, isFn ? "function" : "const", exported);
        }
      }
    }

    // export default function/class
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      exports.push({ name: "default", kind: "export" });
    }

    // Lightweight local identifier references (optional GraphLite signal)
    if (ts.isIdentifier(node) && node.parent && !ts.isImportSpecifier(node.parent)) {
      const parent = node.parent;
      if (
        ts.isCallExpression(parent) ||
        ts.isPropertyAccessExpression(parent) ||
        ts.isTypeReferenceNode(parent)
      ) {
        references.push({ name: node.text, line: lineOf(sf, node.getStart(sf)) });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  return {
    ok: true,
    language: "typescript",
    symbols,
    imports,
    exports,
    references: references.slice(0, 200), // bound noise
  };
}

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript",
  extensions: [...TS_JS_EXTENSIONS],

  extract(input): AdapterExtractResult {
    try {
      // Normalize filePath for ScriptKind; symbols store repo-relative via input
      return extractFromSource(input.filePath, input.source, input.filePath);
    } catch (err) {
      return {
        ok: false,
        language: "typescript",
        symbols: [],
        imports: [],
        exports: [],
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  },
};

/** Probe that the runtime typescript package loads (for orchestrator hard gap). */
export function isTypescriptAdapterAvailable(): boolean {
  try {
    return typeof ts.createSourceFile === "function";
  } catch {
    return false;
  }
}
