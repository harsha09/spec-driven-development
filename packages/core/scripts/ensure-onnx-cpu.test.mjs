import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { fastembedSpec, repairInstallArgs, shouldRepairOnnxCpu } from "./ensure-onnx-cpu.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Linux CPU install of onnxruntime-node", () => {
  it("keeps fastembed optional and does not run the GPU installer under pnpm", () => {
    const root = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    const core = JSON.parse(readFileSync(join(repoRoot, "packages/core/package.json"), "utf8"));
    assert.ok(root.pnpm.neverBuiltDependencies.includes("onnxruntime-node"));
    assert.equal(core.dependencies.fastembed, undefined);
    assert.equal(core.optionalDependencies.fastembed, "3.0.0");
    assert.equal(core.scripts.postinstall, "node ./scripts/ensure-onnx-cpu.mjs");
    assert.ok(core.files.includes("scripts"));
    assert.equal(fastembedSpec(core), "fastembed@3.0.0");
  });

  it("repairs only an npm install on Linux x64", () => {
    const env = { npm_config_user_agent: "npm/11.21.1 node/v20.19.5 linux x64" };
    assert.equal(shouldRepairOnnxCpu({ platform: "linux", arch: "x64", env }), true);
    assert.equal(
      shouldRepairOnnxCpu({
        platform: "linux",
        arch: "x64",
        env: { ...env, ONNXRUNTIME_NODE_INSTALL_CUDA: "skip" },
      }),
      false,
    );
    assert.equal(
      shouldRepairOnnxCpu({
        platform: "linux",
        arch: "x64",
        env: { npm_config_user_agent: "pnpm/9.15.0 npm/? node/v20.19.5 linux x64" },
      }),
      false,
    );
    assert.equal(shouldRepairOnnxCpu({ platform: "darwin", arch: "arm64", env }), false);
    assert.equal(shouldRepairOnnxCpu({ platform: "linux", arch: "arm64", env }), false);
  });

  it("installs the surviving copy outside the optional dependency npm rolls back", () => {
    assert.deepEqual(
      repairInstallArgs(
        { npm_config_global: "true", npm_config_prefix: "/opt/sdd" },
        "fastembed@3.0.0",
      ),
      ["install", "-g", "--prefix", "/opt/sdd", "fastembed@3.0.0", "--no-fund", "--no-audit"],
    );
    assert.deepEqual(
      repairInstallArgs({}, "fastembed@3.0.0", "/pkg/core"),
      [
        "install",
        "fastembed@3.0.0",
        "--no-save",
        "--no-package-lock",
        "--prefix",
        "/pkg/core",
        "--no-fund",
        "--no-audit",
      ],
    );
    assert.equal(repairInstallArgs({ npm_config_global: "true" }, "fastembed@3.0.0", "/pkg/core"), null);
    assert.equal(repairInstallArgs({}, "fastembed@3.0.0", ""), null);
  });
});
