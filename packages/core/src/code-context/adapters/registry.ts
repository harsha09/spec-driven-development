import { extname } from "pathe";
import type { LanguageAdapter } from "./types.js";
import { typescriptAdapter } from "./typescript.js";

/**
 * Extension → adapter registry. Default maps TS/JS only.
 * Unknown extensions: no adapter (orchestrator soft-skips).
 */
export class AdapterRegistry {
  private byExt = new Map<string, LanguageAdapter>();

  constructor(adapters?: LanguageAdapter[]) {
    const list = adapters ?? [typescriptAdapter];
    for (const a of list) {
      for (const ext of a.extensions) {
        this.byExt.set(ext.toLowerCase(), a);
      }
    }
  }

  getByPath(filePath: string): LanguageAdapter | undefined {
    const ext = extname(filePath).toLowerCase();
    return this.byExt.get(ext);
  }

  hasExtension(ext: string): boolean {
    return this.byExt.has(ext.toLowerCase());
  }
}

export function createDefaultRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}
