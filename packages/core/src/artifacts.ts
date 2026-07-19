/**
 * Artifact content quality — existence alone is not "stage complete"
 * (templates are materialized on stage entry and would otherwise auto-pass).
 */

/** Strip comments/headings/empty bullets; require real prose. */
export function isSubstantiveArtifactContent(content: string): boolean {
  const stripped = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^>\s.*$/gm, "")
    .replace(/^\s*[-*+]\s*$/gm, "")
    .replace(/^\s*[-*+]\s*\.\.\.\s*$/gm, "")
    .replace(/^\s*[-*+]\s*TBD\s*$/gim, "")
    .replace(/^\s*[-*+]\s*TODO\s*$/gim, "")
    .replace(/^\s*\|.*\|\s*$/gm, "") // empty-ish tables
    .replace(/`+/g, "")
    .trim();

  // Require enough non-placeholder body
  if (stripped.length < 48) return false;

  // Reject if almost only dashes/placeholders
  const meaningful = stripped
    .replace(/[-–—_.\s]/g, "")
    .replace(/\b(TBD|TODO|N\/A|none|n\/a)\b/gi, "");
  return meaningful.length >= 32;
}

export function incompleteArtifactReason(
  path: string,
  content: string | null,
): string | null {
  if (content == null) {
    return `Missing required artifact: ${path}`;
  }
  if (!isSubstantiveArtifactContent(content)) {
    return (
      `Required artifact still incomplete (looks like empty template/stub): ${path}. ` +
      `Fill it with real content, or skip this stage with \`sdd skip <stage> -r "…"\` if optional.`
    );
  }
  return null;
}
