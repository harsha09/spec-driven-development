/**
 * Typed, user-facing errors for sdd core.
 * CLI maps these to exit codes and optional hints.
 */

export class SddError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly exitCode: number;

  constructor(
    message: string,
    options?: {
      code?: string;
      hint?: string;
      exitCode?: number;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SddError";
    this.code = options?.code ?? "SDD_ERROR";
    this.hint = options?.hint;
    this.exitCode = options?.exitCode ?? 1;
  }
}

export function isSddError(err: unknown): err is SddError {
  return err instanceof SddError;
}

/** Normalize unknown throws into Error for logging. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
