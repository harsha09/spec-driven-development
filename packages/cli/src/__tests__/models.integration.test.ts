import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");
const token = "abcdEFGH-0123456789abcdef0123456789";

function runSdd(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

beforeAll(async () => {
  await import("node:fs/promises").then((fs) => fs.readFile(sddBin, "utf8"));
});

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("sdd models and team check", () => {
  it("explains a work type and rejects a secret without printing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-models-cli-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    expect(runSdd(root, ["team", "init", "--template", "software"]).status).toBe(0);
    const missing = runSdd(root, ["models", "which", "--work-type", "draft"]);
    expect(missing.status).toBe(1);
    expect(missing.stdout.trim()).toBe("No models.yaml.");

    const yaml = [
      "version: 1",
      "models:",
      "  rules: { kind: decide, provider: rules }",
      "  strong: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }",
      "defaults:",
      "  by_work_type:",
      "    route: rules",
      "    draft: strong",
      "  fallback_reason: strong",
      "  fallback_decide: rules",
      "",
    ].join("\n");
    await writeFile(join(root, ".sdd/models.yaml"), yaml, "utf8");
    const which = runSdd(root, ["models", "which", "--work-type", "draft"]);
    expect(which.status).toBe(0);
    expect(which.stdout).toContain("draft  strong  reason  command  work-type default");
    const checked = runSdd(root, ["team", "check"]);
    expect(checked.status).toBe(0);
    expect(checked.stdout.trim()).toBe("Team config is valid.");

    await writeFile(join(root, ".sdd/models.yaml"), yaml.replace("SDD_ROLE_MODEL", token), "utf8");
    const secret = runSdd(root, ["team", "check"]);
    expect(secret.status).toBe(1);
    expect(secret.stdout).toContain("models.yaml has a secret value.");
    expect(secret.stdout).not.toContain(token);
    expect(secret.stderr).not.toContain(token);
  });

  it("routes with a decide command and leaves a reason call on SDD_ROLE_MODEL", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-models-route-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    expect(runSdd(root, ["team", "init", "--template", "software"]).status).toBe(0);
    const script = join(root, "fake-model.js");
    await writeFile(
      script,
      `let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  if (input.mode === "decide") {
    const probs = {};
    for (const option of input.options) probs[option] = 0;
    probs.developer = 0.8;
    probs.human = 0.2;
    process.stdout.write(JSON.stringify({ pick: "developer", probs, input_tokens: 3, output_tokens: 1 }));
    return;
  }
  process.stdout.write(JSON.stringify({ text: "hello " + input.roleId }));
});
`,
      "utf8",
    );
    const command = `${process.execPath} ${JSON.stringify(script)}`;
    const asked = runSdd(root, ["role", "route", "--artifact", "no-such-owns-phrase"], {
      SDD_DECIDE_MODEL: command,
      SDD_ROLE_MODEL: command,
    });
    expect(asked.status).toBe(0);
    expect(asked.stdout).toContain("Ask the human.");
    expect(asked.stdout).toContain("No rule matched.");

    await writeFile(
      join(root, ".sdd/models.yaml"),
      [
        "version: 1",
        "models:",
        "  local: { kind: decide, provider: command, command_env: SDD_DECIDE_MODEL, min_confidence: 0.7 }",
        "  strong: { kind: reason, provider: command, command_env: SDD_ROLE_MODEL }",
        "defaults:",
        "  by_work_type: { route: local }",
        "  fallback_reason: strong",
        "  fallback_decide: local",
        "",
      ].join("\n"),
      "utf8",
    );
    const routed = runSdd(root, ["role", "route", "--artifact", "no-such-owns-phrase"], {
      SDD_DECIDE_MODEL: command,
      SDD_ROLE_MODEL: command,
    });
    expect(routed.status).toBe(0);
    expect(routed.stdout).toContain("role developer");
    expect(routed.stdout).not.toContain("Ask the human.");

    expect(
      runSdd(root, ["role", "create", "--name", "builder", "--label", "Builder", "--job", "Build"])
        .status,
    ).toBe(0);
    const ran = runSdd(root, ["role", "run", "builder", "--task", "say hi"], {
      SDD_ROLE_MODEL: command,
    });
    expect(ran.status).toBe(0);
    expect(ran.stdout.trim()).toBe("hello builder");
  });
});
