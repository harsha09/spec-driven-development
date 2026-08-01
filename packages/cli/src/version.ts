/**
 * Single source of truth injected at build time (see tsup.config.ts).
 * Falls back for `tsx` / unbuilt runs.
 */
declare const __SDD_VERSION__: string | undefined;

export const SDD_VERSION: string =
  typeof __SDD_VERSION__ !== "undefined" && __SDD_VERSION__ ? __SDD_VERSION__ : "0.0.0-dev";
