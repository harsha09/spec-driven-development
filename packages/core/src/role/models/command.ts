import { spawn } from "node:child_process";
import type { RoleModel } from "../types.js";

export function decideStdin(input: {
  state: string;
  question: string;
  options: readonly string[];
}): string {
  return `${JSON.stringify({
    mode: "decide",
    state: input.state,
    question: input.question,
    options: input.options,
  })}\n`;
}

export function spawnModelCommand(command: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "ignore"] });
    const out: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", reject);
    child.stdin?.on("error", () => undefined);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`role model exited ${code ?? "unknown"}`));
        return;
      }
      resolve(Buffer.concat(out).toString("utf8").trim());
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

export function modelFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): RoleModel | undefined {
  const command = env.SDD_ROLE_MODEL?.trim();
  if (!command) return undefined;
  return {
    async complete(input) {
      const text = await spawnModelCommand(
        command,
        `${JSON.stringify({ roleId: input.roleId, prompt: input.prompt })}\n`,
      );
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("role model stdout is not JSON");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("role model stdout is not a JSON object");
      }
      return text;
    },
  };
}
