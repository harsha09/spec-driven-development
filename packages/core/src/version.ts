/**
 * Single source of truth injected at build time (see tsup.config.ts).
 * Falls back for `tsx` / unbuilt test runs.
 */
declare const __SDD_CORE_VERSION__: string | undefined;

export const SDD_CORE_VERSION: string =
  typeof __SDD_CORE_VERSION__ !== "undefined" && __SDD_CORE_VERSION__
    ? __SDD_CORE_VERSION__
    : "0.0.0-dev";
