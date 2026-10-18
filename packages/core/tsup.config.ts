import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "better-sqlite3",
    "gpt-tokenizer",
    "web-tree-sitter",
    "ignore",
    "fastembed",
    "sqlite-vec",
    "onnxruntime-node",
    "@huggingface/hub",
    "@anush008/tokenizers",
  ],
  define: {
    __SDD_CORE_VERSION__: JSON.stringify(pkg.version),
  },
});
