import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MINIMUM_NODE_MAJOR,
  RECOMMENDED_NODE_MAJOR,
  isNodeVersionSupported,
  nodeDoctorDetail,
  nodeEnginesRange,
  nodeNextReleaseNote,
  nodeRecommendedWarning,
  nodeRequirementPhrase,
  nodeSupportLevel,
} from "../node-support.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("doctor version check", () => {
  it("keeps the floor and the recommendation in one place", () => {
    expect(MINIMUM_NODE_MAJOR).toBe(20);
    expect(RECOMMENDED_NODE_MAJOR).toBe(24);
    expect(nodeEnginesRange()).toBe(">=20");
  });

  it("fails Node 18", () => {
    expect(nodeSupportLevel("18.20.8")).toBe("fail");
    expect(nodeSupportLevel("v18.20.0")).toBe("fail");
    expect(isNodeVersionSupported("18.20.8")).toBe(false);
    expect(nodeDoctorDetail("18.20.8")).toBe("v18.20.8 (FAIL: Node 20+ required)");
    expect(nodeDoctorDetail("v18.20.0")).not.toContain("WARN");
  });

  it("warns on Node 20 and Node 22", () => {
    expect(nodeSupportLevel("20.19.5")).toBe("warn");
    expect(nodeSupportLevel("v22.14.0")).toBe("warn");
    expect(isNodeVersionSupported("20.19.5")).toBe(true);
    expect(isNodeVersionSupported("22.23.4")).toBe(true);
    expect(nodeDoctorDetail("20.19.5")).toBe(
      "v20.19.5 (WARN: Node 20–23 works but isn't recommended; Node 24 is recommended)",
    );
    expect(nodeDoctorDetail("v22.14.0")).toBe(
      "v22.14.0 (WARN: Node 20–23 works but isn't recommended; Node 24 is recommended)",
    );
    expect(nodeDoctorDetail("20.19.5")).not.toContain("long-term support");
    expect(nodeDoctorDetail("20.19.5")).not.toContain("official");
    expect(nodeDoctorDetail("20.19.5")).not.toContain("FAIL");
  });

  it("passes Node 24", () => {
    expect(nodeSupportLevel("24.0.0")).toBe("pass");
    expect(nodeSupportLevel("v24.22.2")).toBe("pass");
    expect(isNodeVersionSupported("24.0.0")).toBe(true);
    expect(nodeDoctorDetail("24.0.0")).toBe("v24.0.0");
    expect(nodeDoctorDetail("v24.22.2")).toBe("v24.22.2");
    expect(nodeDoctorDetail("24.0.0")).not.toContain("WARN");
    expect(nodeDoctorDetail("24.0.0")).not.toContain("FAIL");
    expect(nodeDoctorDetail("24.0.0")).not.toContain("required");
  });

  it("warns through 23 and passes from 24", () => {
    expect(nodeSupportLevel("23.11.0")).toBe("warn");
    expect(nodeSupportLevel("25.0.0")).toBe("pass");
    expect(nodeSupportLevel("19.9.0")).toBe("fail");
    expect(nodeSupportLevel("not-a-version")).toBe("fail");
  });
});

describe("Node rule is written once", () => {
  const phrase = nodeRequirementPhrase();

  it("uses one warning sentence", () => {
    expect(phrase).toBe(nodeRecommendedWarning());
    expect(phrase).toBe("Node 20–23 works but isn't recommended; Node 24 is recommended");
    expect(nodeNextReleaseNote()).toContain(phrase);
    expect(nodeNextReleaseNote()).toContain("This is not long-term support for Node 20");
    expect(nodeNextReleaseNote()).toContain("not in CLI 0.24.0");
  });

  it("matches every package engines field", () => {
    for (const rel of ["package.json", "packages/cli/package.json", "packages/core/package.json"]) {
      const pkg = JSON.parse(readFileSync(join(repoRoot, rel), "utf8")) as {
        engines: { node: string };
      };
      expect(pkg.engines.node).toBe(nodeEnginesRange());
    }
  });

  it("matches the README requirement line and the other install lines", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toContain(
      `| **Needs** | CLI 0.24.0: Node 24+. Next release: ${phrase} · about 10 minutes for the first loop |`,
    );
    expect(readme).toContain(
      "**CLI 0.24.0, checked here.** `engines.node` is `>=24`. `sdd doctor` fails the Node line when the major is below 24.",
    );
    expect(readme).toContain(nodeNextReleaseNote());

    const tutorial = readFileSync(join(repoRoot, "docs/tutorials/first-change.md"), "utf8");
    expect(tutorial).toContain(
      `| **You need** | CLI 0.24.0: Node.js 24+ and a folder for an app (or an empty folder). Next release: ${phrase}. |`,
    );
    expect(tutorial).toContain(
      "so v20.19.5 prints `✗ Node.js  v20.19.5 (24+ required)`. This page's doctor run used v24.22.2, and that line passed.",
    );
    expect(tutorial).toContain(nodeNextReleaseNote());

    expect(readFileSync(join(repoRoot, "docs/index.md"), "utf8")).toContain(
      `| **Node.js** | CLI 0.24.0: 24 or newer. Next release: ${phrase}. |`,
    );
    expect(readFileSync(join(repoRoot, "skills/README.md"), "utf8")).toContain(
      `Next release: ${phrase}. This is not long-term support for Node ${MINIMUM_NODE_MAJOR}.`,
    );
    const maintainers = readFileSync(join(repoRoot, "docs/maintainers/ci-cd.md"), "utf8");
    expect(maintainers).toContain(`\`${nodeEnginesRange()}\``);
    expect(maintainers).toContain(phrase);
    expect(maintainers).toContain(`This is not long-term support for Node ${MINIMUM_NODE_MAJOR}`);
    const roadmap = readFileSync(join(repoRoot, "ROADMAP.md"), "utf8");
    expect(roadmap).toContain(phrase);
    expect(roadmap).toContain(`This is not long-term support for Node ${MINIMUM_NODE_MAJOR}`);
  });

  it("tests Node 20 and Node 24 in CI and keeps release on the recommendation", () => {
    const ci = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain(`node: ["${MINIMUM_NODE_MAJOR}", "${RECOMMENDED_NODE_MAJOR}"]`);
    for (const rel of [".github/workflows/docs.yml", ".github/workflows/release.yml"]) {
      expect(readFileSync(join(repoRoot, rel), "utf8")).toContain(
        `node-version: "${RECOMMENDED_NODE_MAJOR}"`,
      );
    }
  });
});
