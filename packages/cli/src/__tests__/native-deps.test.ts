import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NATIVE_DEPS_CONFIG_COMMAND,
  NATIVE_DEPS_INSTALL_COMMAND,
  type NativeDependencyName,
  classifyNativeLoadError,
  inspectNativeDependencies,
  loadNativeDependency,
  nativeDependencyDetail,
  nativeDoctorLines,
} from "../native-deps.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function missing(name: string): Error {
  return Object.assign(new Error(`Cannot find module '${name}'`), { code: "MODULE_NOT_FOUND" });
}

describe("native dependency check", () => {
  it("loads better-sqlite3 and onnxruntime-node from this install", () => {
    expect(() => loadNativeDependency("better-sqlite3")).not.toThrow();
    expect(() => loadNativeDependency("onnxruntime-node")).not.toThrow();
    expect(inspectNativeDependencies()).toEqual([
      { name: "better-sqlite3", ok: true, failure: null, detail: "loaded" },
      { name: "onnxruntime-node", ok: true, failure: null, detail: "loaded" },
    ]);
  });

  it("passes doctor when both native modules load", () => {
    const view = nativeDoctorLines(inspectNativeDependencies(() => undefined));
    expect(view.checks).toEqual([
      {
        label: "Native modules",
        ok: true,
        detail: "better-sqlite3, onnxruntime-node",
      },
    ]);
    expect(view.fix).toBeNull();
    expect(view.config).toBeNull();
  });

  it("names a missing module and an unbuilt module, and prints the install fix", () => {
    const reports = inspectNativeDependencies((name: NativeDependencyName) => {
      if (name === "better-sqlite3") {
        throw new Error(
          "Could not locate the bindings file. Tried:\n → /tmp/project/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
        );
      }
      throw missing("onnxruntime-node");
    });
    const view = nativeDoctorLines(reports);

    expect(reports.map((report) => report.failure)).toEqual(["unbuilt", "missing"]);
    expect(view.checks).toEqual([
      {
        label: "better-sqlite3",
        ok: false,
        detail: "better-sqlite3 is installed but its native build is missing",
      },
      {
        label: "onnxruntime-node",
        ok: false,
        detail: "onnxruntime-node is not installed",
      },
    ]);
    expect(view.fix).toBe(NATIVE_DEPS_INSTALL_COMMAND);
    expect(view.config).toBe(NATIVE_DEPS_CONFIG_COMMAND);
    expect(view.fix).toBe(
      "npm install -g --allow-scripts=better-sqlite3,onnxruntime-node @structured-vibe-coding/cli",
    );
    expect(view.config).toBe(
      "npm config set allow-scripts=better-sqlite3,onnxruntime-node --location=user",
    );
    expect(JSON.stringify(view)).not.toContain("/tmp/");
    expect(JSON.stringify(view)).not.toContain("node_modules");
  });

  it("treats a missing native binary as unbuilt even when the code is MODULE_NOT_FOUND", () => {
    const error = Object.assign(
      new Error(
        "Cannot find module '/opt/pkg/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node'",
      ),
      { code: "MODULE_NOT_FOUND" },
    );
    expect(classifyNativeLoadError(error)).toBe("unbuilt");
    expect(nativeDependencyDetail("onnxruntime-node", "unbuilt")).toBe(
      "onnxruntime-node is installed but its native build is missing",
    );
  });

  it("treats a missing package as missing", () => {
    expect(classifyNativeLoadError(missing("better-sqlite3"))).toBe("missing");
    expect(classifyNativeLoadError(missing("fastembed/package.json"))).toBe("missing");
    expect(nativeDependencyDetail("better-sqlite3", "missing")).toBe(
      "better-sqlite3 is not installed",
    );
  });

  it("still prints the fix when only one module fails", () => {
    const view = nativeDoctorLines(
      inspectNativeDependencies((name: NativeDependencyName) => {
        if (name === "onnxruntime-node") throw new Error("The N-API version is not supported");
      }),
    );
    expect(view.checks).toEqual([
      { label: "better-sqlite3", ok: true, detail: "loaded" },
      {
        label: "onnxruntime-node",
        ok: false,
        detail: "onnxruntime-node is installed but its native build is missing",
      },
    ]);
    expect(view.fix).toBe(NATIVE_DEPS_INSTALL_COMMAND);
  });

  it("documents the same fix in the install guides", () => {
    for (const rel of [
      "README.md",
      "packages/cli/README.md",
      "docs/index.md",
      "docs/tutorials/first-change.md",
      "docs/reference/cli.md",
      "docs/maintainers/ci-cd.md",
    ]) {
      const text = readFileSync(join(repoRoot, rel), "utf8");
      expect(text, rel).toContain(NATIVE_DEPS_INSTALL_COMMAND);
      expect(text, rel).toContain(NATIVE_DEPS_CONFIG_COMMAND);
    }
  });
});
