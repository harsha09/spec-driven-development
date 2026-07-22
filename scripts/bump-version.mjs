#!/usr/bin/env node
/**
 * Bump synchronized versions across the monorepo.
 *
 * Usage:
 *   node scripts/bump-version.mjs              # auto from conventional commits since last tag
 *   node scripts/bump-version.mjs patch|minor|major
 *   node scripts/bump-version.mjs --set 1.2.3
 *
 * Env:
 *   GITHUB_OUTPUT — if set, writes version= and bump= for Actions
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGE_JSONS = [
  "package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
];

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  }).trim();
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function writeJson(rel, data) {
  writeFileSync(join(root, rel), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseSemver(v) {
  const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bumpSemver(version, type) {
  const v = parseSemver(version);
  if (type === "major") return formatSemver({ major: v.major + 1, minor: 0, patch: 0 });
  if (type === "minor") return formatSemver({ major: v.major, minor: v.minor + 1, patch: 0 });
  if (type === "patch") return formatSemver({ major: v.major, minor: v.minor, patch: v.patch + 1 });
  throw new Error(`Unknown bump type: ${type}`);
}

function lastTag() {
  try {
    return sh("git describe --tags --abbrev=0");
  } catch {
    return "";
  }
}

function commitsSince(tag) {
  try {
    if (tag) return sh(`git log ${tag}..HEAD --pretty=%s`);
    return sh("git log --pretty=%s");
  } catch {
    return "";
  }
}

/**
 * Conventional Commits → bump type.
 * feat! / BREAKING CHANGE → major
 * feat → minor
 * else → patch
 */
function detectBump(messages) {
  const lines = messages.split("\n").map((l) => l.trim()).filter(Boolean);
  let bump = "patch";
  for (const line of lines) {
    if (/BREAKING CHANGE/i.test(line) || /^[a-z]+(\(.+\))?!:/i.test(line)) {
      return "major";
    }
    if (/^feat(\(.+\))?:/i.test(line)) {
      bump = "minor";
    }
  }
  return bump;
}

function main() {
  const args = process.argv.slice(2);
  let bumpType;
  let setVersion;

  if (args[0] === "--set" && args[1]) {
    setVersion = args[1];
  } else if (args[0] && ["patch", "minor", "major"].includes(args[0])) {
    bumpType = args[0];
  } else {
    const tag = lastTag();
    const msgs = commitsSince(tag);
    bumpType = detectBump(msgs);
    console.log(`Last tag: ${tag || "(none)"}`);
    console.log(`Detected bump: ${bumpType}`);
    if (msgs) {
      console.log("Commits considered:");
      for (const line of msgs.split("\n").slice(0, 20)) {
        if (line.trim()) console.log(`  - ${line}`);
      }
    }
  }

  const current = readJson("packages/core/package.json").version;
  const next = setVersion ?? bumpSemver(current, bumpType);

  if (next === current && !setVersion) {
    // still bump patch if same (shouldn't happen with bumpSemver)
  }

  console.log(`Version: ${current} → ${next}`);

  for (const rel of PACKAGE_JSONS) {
    const pkg = readJson(rel);
    pkg.version = next;
    writeJson(rel, pkg);
    console.log(`  updated ${rel}`);
  }

  // Keep workspace dependency as workspace:* (pnpm rewrites on publish)
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `version=${next}\nbump=${bumpType || "set"}\n`, {
      flag: "a",
    });
  }

  console.log(next);
}

main();
