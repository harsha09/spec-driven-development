import { type SddPinRead, readSddPin } from "@structured-vibe-coding/core";
import { SDD_VERSION } from "./version.js";

const DEFAULT_PACKAGE = "@structured-vibe-coding/cli";

export function pinInstallCommand(version: string, packageName: string | null): string {
  return `npm install -g ${packageName ?? DEFAULT_PACKAGE}@${version}`;
}

/** Installed version, plus one line when `.sdd/sdd-pin.yaml` differs or cannot be read. */
export async function formatCliVersion(projectRoot: string): Promise<string> {
  const lines = [SDD_VERSION];
  const pin = await readSddPin(projectRoot);
  const extra = pinMismatchLine(pin);
  if (extra) lines.push(extra);
  return lines.join("\n");
}

export function pinMismatchLine(pin: SddPinRead): string | null {
  if (pin.state === "invalid") {
    return `Could not read .sdd/sdd-pin.yaml (${pin.message}).`;
  }
  if (pin.state === "ok" && pin.version !== SDD_VERSION) {
    return `Pinned build ${pin.version} in .sdd/sdd-pin.yaml does not match this install. Install: ${pinInstallCommand(pin.version, pin.packageName)}`;
  }
  return null;
}
