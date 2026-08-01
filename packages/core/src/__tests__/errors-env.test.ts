import { describe, expect, it } from "vitest";
import { toProcessEnv } from "../env.js";
import { SddError, errorMessage, isSddError } from "../errors.js";

describe("SddError", () => {
  it("carries code and hint", () => {
    const err = new SddError("nope", {
      code: "TEST",
      hint: "try again",
      exitCode: 2,
    });
    expect(isSddError(err)).toBe(true);
    expect(err.code).toBe("TEST");
    expect(err.hint).toBe("try again");
    expect(err.exitCode).toBe(2);
  });

  it("errorMessage normalizes unknowns", () => {
    expect(errorMessage(new Error("x"))).toBe("x");
    expect(errorMessage("y")).toBe("y");
  });
});

describe("toProcessEnv", () => {
  it("drops undefined and stringifies", () => {
    const env = toProcessEnv({ A: "1", B: undefined, C: "ok" }, { D: "2", E: undefined });
    expect(env).toEqual({ A: "1", C: "ok", D: "2" });
    expect("B" in env).toBe(false);
  });
});
