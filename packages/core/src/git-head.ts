import { spawn } from "node:child_process";
import { join } from "pathe";
import { pathExists } from "./fs.js";

export type GitHeadRunner = (projectRoot: string) => Promise<string>;

function runGitHead(projectRoot: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `git rev-parse exited with code ${code}`));
    });
  });
}

export async function getHeadSha(
  projectRoot: string,
  runGit: GitHeadRunner = runGitHead,
): Promise<string | null> {
  if (!(await pathExists(join(projectRoot, ".git")))) return null;
  let sha: string;
  try {
    sha = await runGit(projectRoot);
  } catch {
    return null;
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha)) {
    throw new Error("git rev-parse returned an invalid HEAD SHA.");
  }
  return sha.toLowerCase();
}
