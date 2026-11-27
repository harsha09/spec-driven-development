import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Linux x64 install of onnxruntime-node@1.21.0 (pulled in by fastembed) runs
 * script/install.js. The CPU binaries are already in the package. The script
 * still downloads an optional GPU archive, and that URL returns 404, which
 * aborts a normal npm install. npm deletes the failed optional package after
 * the script exits, so this runs a second install with the GPU download
 * skipped. The CPU build is what remains.
 *
 * pnpm skips that script via neverBuiltDependencies, so this does nothing
 * under pnpm. The CPU files from the original package stay on disk.
 */

const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export function fastembedSpec(pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))) {
  const version = pkg?.optionalDependencies?.fastembed;
  if (!version) {
    throw new Error("fastembed is not an optionalDependency");
  }
  return `fastembed@${version}`;
}

/** True only for an npm install on Linux x64 that did not already skip the GPU archive. */
export function shouldRepairOnnxCpu({ platform, arch, env }) {
  if (platform !== "linux" || arch !== "x64") return false;
  const cuda = env.ONNXRUNTIME_NODE_INSTALL_CUDA;
  if (typeof cuda === "string" && cuda.toLowerCase() === "skip") return false;
  const agent = env.npm_config_user_agent ?? "";
  return agent.startsWith("npm/");
}

/**
 * Args for a second install that survives npm's rollback of the failed optional
 * dependency. A global install nests that dependency inside the package and
 * deletes it, so the replacement is installed at the global prefix. A local
 * install hoists it to the project and deletes that path, so the replacement
 * is installed inside this package.
 */
export function repairInstallArgs(env, spec, packageDir) {
  const tail = ["--no-fund", "--no-audit"];
  if (env.npm_config_global === "true") {
    const prefix = env.npm_config_prefix;
    if (!prefix) return null;
    return ["install", "-g", "--prefix", prefix, spec, ...tail];
  }
  if (!packageDir) return null;
  return ["install", spec, "--no-save", "--no-package-lock", "--prefix", packageDir, ...tail];
}

function warn(message) {
  process.stderr.write(`sdd: ${message}\n`);
}

export function repairOnnxCpu(env = process.env, spawn = spawnSync) {
  if (!shouldRepairOnnxCpu({ platform: process.platform, arch: process.arch, env })) {
    return 0;
  }
  let spec = "";
  try {
    spec = fastembedSpec();
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
    return 0;
  }
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const args = repairInstallArgs(env, spec, packageDir);
  if (!args) {
    warn("could not find an npm prefix for the CPU build of onnxruntime-node.");
    return 0;
  }
  const result = spawn("npm", args, {
    env: { ...env, ONNXRUNTIME_NODE_INSTALL_CUDA: "skip" },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    warn(
      "the CPU build of onnxruntime-node was not installed. sdd doctor names the module and the reinstall command.",
    );
  }
  return 0;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  repairOnnxCpu();
}
