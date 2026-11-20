import { describe, expect, it } from "vitest";
import { unknownArgProblem } from "../argv.js";

describe("unknownArgProblem", () => {
  it("accepts real commands, values that look like flags, and help", async () => {
    expect(await unknownArgProblem(["--version"])).toBeNull();
    expect(await unknownArgProblem(["next", "--help"])).toBeNull();
    expect(
      await unknownArgProblem(["new", "Add export", "-w", "team-software", "-y", "--no-agent"]),
    ).toBeNull();
    expect(
      await unknownArgProblem([
        "mcp",
        "sources",
        "add",
        "--id",
        "a",
        "--command",
        "npx",
        "--arg",
        "-y",
      ]),
    ).toBeNull();
    expect(await unknownArgProblem(["role", "room", "no-such-change"])).toBeNull();
  });

  it("names an unknown command and an unknown flag", async () => {
    expect(await unknownArgProblem(["stauts"])).toBe('Unknown command "stauts".');
    expect(await unknownArgProblem(["role", "frobnicate"])).toContain(
      'Unknown command "frobnicate"',
    );
    expect(await unknownArgProblem(["role", "frobnicate"])).toContain("sdd role");
    expect(await unknownArgProblem(["next", "--chnage", "x"])).toBe(
      'Unknown flag "--chnage" for "sdd next".',
    );
  });
});
