import { describe, expect, it } from "vitest";
import { changeDirName, slugify, uniqueChangeDirName } from "../slug.js";

describe("change slugs", () => {
  it.each([
    [' Fix DON\'T "panic" ', "fix-dont-panic"],
    [
      "Lagna list drops the last sign change before next sunrise (#152)",
      "lagna-list-drops-the-last-sign-change-before-next-152",
    ],
    [`fix ${"a".repeat(53)} #152`, "fix-152"],
    [`${"a".repeat(56)} more (#152)`, `${"a".repeat(56)}-152`],
    [`${"a".repeat(55)} word`, `${"a".repeat(55)}-word`],
    [`${"a".repeat(55)} word next`, `${"a".repeat(55)}-word`],
    [`${"a".repeat(55)} words`, "a".repeat(55)],
    [`fix ${"a".repeat(53)} 152`, `fix-${"a".repeat(53)}`],
    ["a".repeat(61), ""],
    [`${"a".repeat(61)} later`, ""],
    [`${"a".repeat(61)} (#152)`, "152"],
    ["(#152)", "152"],
    ["FOO 123 #00152", "foo-123-00152"],
    [`fix #${"1".repeat(60)}`, "1".repeat(60)],
    [`fix #${"1".repeat(61)}`, "fix"],
    ["CAF\u00c9 \u6771\u4eac #00152", "caf-00152"],
    [`A${" ".repeat(100)}`, "a"],
  ])("keeps whole tokens in %j", (input, expected) => {
    const slug = slugify(input);
    expect(slug).toBe(expected);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).not.toMatch(/^-|-$/);
  });

  it("retains the date, empty-title fallback, and collision suffix behavior", () => {
    const date = new Date("2026-10-12T00:30:00+02:00");
    expect(changeDirName("Fix (#152)", date)).toBe("2026-10-11-fix-152");
    expect(changeDirName("a".repeat(61), date)).toBe("2026-10-11-change");
    const base = changeDirName("a".repeat(60), date);
    expect(uniqueChangeDirName(base, new Set([base, `${base}-2`]))).toBe(`${base}-3`);
  });
});
