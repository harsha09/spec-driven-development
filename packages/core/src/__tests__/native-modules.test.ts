import { describe, expect, it } from "vitest";
import { NATIVE_INSTALL_FIX, NATIVE_MODULES, checkNativeModules } from "../native-modules.js";

describe("checkNativeModules", () => {
  it("names each addon and the install command when a load fails", () => {
    const checked = checkNativeModules((name) => {
      if (name === "onnxruntime-node") throw new Error("Could not locate the bindings file");
    });
    expect(checked.map((item) => item.name)).toEqual([...NATIVE_MODULES]);
    expect(checked[0]).toMatchObject({ name: "better-sqlite3", ok: true });
    expect(checked[1]?.ok).toBe(false);
    expect(checked[1]?.detail).toContain("bindings file");
    expect(NATIVE_INSTALL_FIX).toContain("--allow-scripts=better-sqlite3,onnxruntime-node");
  });
});
