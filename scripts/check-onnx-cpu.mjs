import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * After a plain install on Linux x64, the CPU binding must load.
 * The GPU archive is not required for that.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "linux" || process.arch !== "x64") {
  console.log("onnx cpu check skipped");
  process.exit(0);
}

const require = createRequire(join(root, "packages/core/package.json"));
const fastembedEntry = require.resolve("fastembed");
const ortRequire = createRequire(fastembedEntry);
const pkgJson = ortRequire.resolve("onnxruntime-node/package.json");
const cpu = join(dirname(pkgJson), "bin/napi-v3/linux/x64/onnxruntime_binding.node");
if (!existsSync(cpu)) {
  console.error(`missing CPU binding: ${cpu}`);
  process.exit(1);
}

const ort = ortRequire("onnxruntime-node");
if (typeof ort.InferenceSession !== "function") {
  console.error("onnxruntime-node loaded without InferenceSession");
  process.exit(1);
}

console.log("onnxruntime-node CPU binding loaded");
