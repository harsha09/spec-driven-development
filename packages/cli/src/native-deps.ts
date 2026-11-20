import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Native packages whose install scripts current npm skips unless allowed.
 * `better-sqlite3` is a dependency of core. `onnxruntime-node` is a dependency
 * of `fastembed`, which core loads for embeddings.
 */
export const NATIVE_DEPENDENCIES = ["better-sqlite3", "onnxruntime-node"] as const;

export type NativeDependencyName = (typeof NATIVE_DEPENDENCIES)[number];

/** One-shot global install that runs the skipped native install scripts. */
export const NATIVE_DEPS_INSTALL_COMMAND =
  "npm install -g --allow-scripts=better-sqlite3,onnxruntime-node @structured-vibe-coding/cli";

/** Persist the same allow list for later global installs. Reinstall after setting it. */
export const NATIVE_DEPS_CONFIG_COMMAND =
  "npm config set allow-scripts=better-sqlite3,onnxruntime-node --location=user";

export type NativeLoadFailure = "missing" | "unbuilt";

export type NativeDependencyReport = {
  name: NativeDependencyName;
  ok: boolean;
  failure: NativeLoadFailure | null;
  /** Short reason safe to print. No filesystem paths. */
  detail: string;
};

export type NativeDoctorView = {
  checks: { label: string; ok: boolean; detail: string }[];
  fix: string | null;
  config: string | null;
};

export type NativeModuleLoader = (name: NativeDependencyName) => void;

/**
 * Find an installed package.json by walking up from `startDir`.
 * Core's exports map has no `require` condition, so `require.resolve` cannot
 * see it. A directory walk works from the CLI source, the bundled CLI, and
 * a global npm install whether or not dependencies are hoisted.
 */
export function findInstalledPackageJson(startDir: string, name: string): string {
  const relativePath = join("node_modules", ...name.split("/"), "package.json");
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, relativePath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const error = new Error(`Cannot find module '${name}'`);
  (error as NodeJS.ErrnoException).code = "MODULE_NOT_FOUND";
  throw error;
}

/**
 * Load one native module from the package that depends on it.
 * The CLI does not depend on these packages directly, and pnpm will not
 * resolve them from the CLI. Node walks up from the owning package, which
 * also works for an npm global install.
 */
export function loadNativeDependency(name: NativeDependencyName): void {
  const startDir = dirname(fileURLToPath(import.meta.url));
  const corePkg = findInstalledPackageJson(startDir, "@structured-vibe-coding/core");
  const coreRequire = createRequire(corePkg);
  if (name === "better-sqlite3") {
    coreRequire("better-sqlite3");
    return;
  }
  const fastembedEntry = coreRequire.resolve("fastembed");
  createRequire(fastembedEntry)("onnxruntime-node");
}

export function classifyNativeLoadError(error: unknown): NativeLoadFailure {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const binaryMissing =
    /\.node\b/.test(message) ||
    /bindings file/i.test(message) ||
    /could not locate the bindings/i.test(message) ||
    /did not self-register/i.test(message);
  if (binaryMissing) return "unbuilt";
  if (
    code === "MODULE_NOT_FOUND" ||
    code === "ERR_MODULE_NOT_FOUND" ||
    /cannot find module/i.test(message)
  ) {
    return "missing";
  }
  return "unbuilt";
}

export function nativeDependencyDetail(name: string, failure: NativeLoadFailure): string {
  if (failure === "missing") return `${name} is not installed`;
  return `${name} is installed but its native build is missing`;
}

export function inspectNativeDependencies(
  load: NativeModuleLoader = loadNativeDependency,
): NativeDependencyReport[] {
  return NATIVE_DEPENDENCIES.map((name) => {
    try {
      load(name);
      return { name, ok: true, failure: null, detail: "loaded" };
    } catch (error) {
      const failure = classifyNativeLoadError(error);
      return { name, ok: false, failure, detail: nativeDependencyDetail(name, failure) };
    }
  });
}

/** Lines `sdd doctor` prints for the native-module check. */
export function nativeDoctorLines(reports: NativeDependencyReport[]): NativeDoctorView {
  if (reports.every((report) => report.ok)) {
    return {
      checks: [
        {
          label: "Native modules",
          ok: true,
          detail: reports.map((report) => report.name).join(", "),
        },
      ],
      fix: null,
      config: null,
    };
  }
  return {
    checks: reports.map((report) => ({
      label: report.name,
      ok: report.ok,
      detail: report.ok ? "loaded" : report.detail,
    })),
    fix: NATIVE_DEPS_INSTALL_COMMAND,
    config: NATIVE_DEPS_CONFIG_COMMAND,
  };
}
