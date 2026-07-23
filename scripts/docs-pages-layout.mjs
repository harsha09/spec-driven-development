/**
 * GitHub Pages serves:
 *   /foo      → foo.html OR foo/index.html
 *   /foo/     → foo/index.html only (foo.html → 404)
 *
 * VitePress cleanUrls emits foo.html. Rewrite to foo/index.html so both
 * /foo and /foo/ work on project Pages.
 */
import { readdir, mkdir, rename, access, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../docs/.vitepress/dist");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "assets") continue;
      await walk(full);
      continue;
    }
    if (!ent.name.endsWith(".html")) continue;
    if (ent.name === "index.html" || ent.name === "404.html") continue;

    const base = ent.name.replace(/\.html$/, "");
    const targetDir = join(dir, base);
    const target = join(targetDir, "index.html");
    if (await exists(target)) continue;
    await mkdir(targetDir, { recursive: true });
    await rename(full, target);
    console.log(`pages-layout: ${full.replace(dist, "")} → ${target.replace(dist, "")}`);
  }
}

await walk(dist);
// Jekyll must not process the site (VitePress static assets)
await writeFile(join(dist, ".nojekyll"), "");
console.log("pages-layout: done (+ .nojekyll)");
