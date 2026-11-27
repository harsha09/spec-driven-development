import { join } from "pathe";
import { z } from "zod";
import { pathExists, readYaml } from "./fs.js";
import { sddRoot } from "./paths.js";

/** Repo pin compared with the installed build by `sdd --version` and `sdd doctor`. */
export const SDD_PIN_FILENAME = "sdd-pin.yaml";

const PinSchema = z.object({
  version: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  package: z.string().trim().min(1).optional(),
});

export type SddPinRead =
  | { state: "absent" }
  | { state: "ok"; version: string; packageName: string | null }
  | { state: "invalid"; message: string };

export function sddPinPath(projectRoot: string): string {
  return join(sddRoot(projectRoot), SDD_PIN_FILENAME);
}

/** Absent when the file is missing. Invalid when it cannot be read or has no version. */
export async function readSddPin(projectRoot: string): Promise<SddPinRead> {
  const path = sddPinPath(projectRoot);
  if (!(await pathExists(path))) return { state: "absent" };
  let raw: unknown;
  try {
    raw = await readYaml(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { state: "invalid", message };
  }
  const parsed = PinSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.version) {
    return { state: "invalid", message: "version is required" };
  }
  return {
    state: "ok",
    version: parsed.data.version,
    packageName: parsed.data.package ?? null,
  };
}
