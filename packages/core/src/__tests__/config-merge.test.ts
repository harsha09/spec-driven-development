import { describe, expect, it } from "vitest";
import { mergeConfigDefaults } from "../index.js";

describe("mergeConfigDefaults", () => {
  it("preserves nested user values and adds new defaults", () => {
    const config = mergeConfigDefaults({
      memory_path: ".sdd/memory",
      changes_path: ".sdd/changes",
      per_change: { allow_skip: false },
      persistence: { domain_sync: { anchored_domains: ["billing"] } },
    });

    expect(config.memory_path).toBe(".sdd/memory");
    expect(config.changes_path).toBe(".sdd/changes");
    expect(config.per_change.allow_skip).toBe(false);
    expect(config.per_change.allow_gate_override).toBe("soft_only");
    expect(config.per_change.require_reason_on_skip).toBe(true);
    expect(config.persistence.domain_sync.anchored_domains).toEqual(["billing"]);
    expect(config.metrics.enabled).toBe(true);
  });

  it("validates merged values instead of persisting malformed config", () => {
    expect(() => mergeConfigDefaults({ memory_path: false })).toThrow();
  });
});
