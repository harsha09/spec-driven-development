/**
 * Hard-deny secret/credential paths before parse (LLD §2.10 / ARB #3, #6).
 * Never put denied path contents into slices or gap detail.
 */

import { basename, normalize } from "pathe";

/** Filename patterns that indicate secrets (case-insensitive). */
const SECRET_BASENAME_PATTERNS: RegExp[] = [
  /^\.env$/i,
  /^\.env\..+/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /credentials/i,
  /secret/i,
];

/**
 * Returns true if the path should never be analyzed (secret/credentials risk).
 * Matches on normalized path segments and basename.
 */
export function isSecretPath(filePath: string): boolean {
  const norm = normalize(filePath).replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  if (parts.includes(".git")) return true;
  // .git/ anywhere as segment
  if (norm.includes("/.git/") || norm.startsWith(".git/") || norm === ".git") {
    return true;
  }
  const base = basename(norm);
  return SECRET_BASENAME_PATTERNS.some((re) => re.test(base));
}
