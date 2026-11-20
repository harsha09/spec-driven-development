import { createRequire } from "node:module";

/** Native addons a global npm install skips when scripts are not allowed. */
export const NATIVE_MODULES = ["better-sqlite3", "onnxruntime-node"] as const;

export const NATIVE_INSTALL_FIX =
  "npm install -g --allow-scripts=better-sqlite3,onnxruntime-node @structured-vibe-coding/cli";

export interface NativeModuleStatus {
  name: string;
  ok: boolean;
  /** First line of the load error, empty when the module loaded. */
  detail: string;
}

function defaultLoad(name: string): void {
  const require = createRequire(import.meta.url);
  if (name === "onnxruntime-node") {
    let from = import.meta.url;
    try {
      from = require.resolve("fastembed");
    } catch {
      // Fall through and report that onnxruntime-node itself did not load.
    }
    createRequire(from)(name);
    return;
  }
  require(name);
}

/** Try each native addon. `load` throws when that module cannot be required. */
export function checkNativeModules(
  load: (name: string) => void = defaultLoad,
): NativeModuleStatus[] {
  return NATIVE_MODULES.map((name) => {
    try {
      load(name);
      return { name, ok: true, detail: "" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail = message.split("\n")[0] ?? message;
      return { name, ok: false, detail };
    }
  });
}
