import { describe, expect, it } from "vitest";
import { isNodeVersionSupported } from "../node-support.js";

describe("Node.js support range", () => {
  it.each(["v18.20.0", "20.19.5", "v22.14.0", "23.0.0"])(
    "rejects unsupported runtime %s",
    (version) => {
      expect(isNodeVersionSupported(version)).toBe(false);
    },
  );

  it.each(["24.0.0", "v24.1.2", "25.0.0"])("accepts supported runtime %s", (version) => {
    expect(isNodeVersionSupported(version)).toBe(true);
  });
});
