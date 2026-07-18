#!/usr/bin/env node
/**
 * If the current monorepo version is already on npm, bump patch until free.
 *
 * Usage: node scripts/ensure-unpublished-version.mjs
 * Env: GITHUB_OUTPUT → version=
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
  return pkg.version;
}

function published(name, version) {
  try {
    const out = execSync(`npm view ${name}@${version} version`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    }).trim();
    return out === version;
  } catch {
    return false;
  }
}

let version = readVersion();
let guards = 0;
while (
  published("@structured-vibe-coding/core", version) ||
  published("@structured-vibe-coding/cli", version)
) {
  console.log(`Version ${version} already on npm — bumping patch`);
  execSync("node scripts/bump-version.mjs patch", {
    cwd: root,
    stdio: "inherit",
  });
  version = readVersion();
  guards += 1;
  if (guards > 50) {
    throw new Error("Gave up finding an unpublished version after 50 patch bumps");
  }
}

console.log(`Publishable version: ${version}`);
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`, { flag: "a" });
}
