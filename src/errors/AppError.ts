/**
 * @fileoverview Typed application error class used throughout the domain,
 * storage and CLI layers.
 *
 * All errors propagated to the user interface must be instances of `AppError`
 * so that the CLI can display structured, human-readable messages without
 * exposing internal stack traces.
 */

/**
 * Discriminated union of all error codes produced by the application.
 *
 * | Code               | Meaning                                                        |
 * |--------------------|----------------------------------------------------------------|
 * | VALIDATION_ERROR   | Input failed a domain constraint (amount ≤ 0, empty name, …). |
 * | NOT_FOUND          | A subscription with the given id does not exist.               |
 * | DUPLICATE_ID       | Attempted to insert a subscription with an already-used id.    |
 * | FILE_NOT_FOUND     | The data file does not exist on disk (internal; yields `[]`).  |
 * | FILE_CORRUPT       | The data file exists but its content is not valid JSON.        |
 * | SCHEMA_MISMATCH    | The JSON is valid but does not conform to `Subscription[]`.    |
 * | IO_READ_ERROR      | A low-level OS error occurred while reading the data file.     |
 * | IO_WRITE_ERROR     | A low-level OS error occurred while writing the data file.     |
 * | UNSUPPORTED_FORMAT | The requested export format is not recognised.                 |
 * | FORBIDDEN_FIELD    | The caller tried to modify a field that must not change (id).  |
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_ID"
  | "FILE_NOT_FOUND"
  | "FILE_CORRUPT"
  | "SCHEMA_MISMATCH"
  | "IO_READ_ERROR"
  | "IO_WRITE_ERROR"
  | "UNSUPPORTED_FORMAT"
  | "FORBIDDEN_FIELD";

/**
 * Structured application error that carries a typed code, a user-facing
 * message (in Spanish) and an optional context value for debugging.
 *
 * @example
 * throw new AppError(
 *   "VALIDATION_ERROR",
 *   "El importe debe ser mayor que 0.",
 *   { received: amount }
 * );
 */
export class AppError extends Error {
  /**
   * Machine-readable code that identifies the error category.
   * Use this code for programmatic handling (e.g. in the CLI error boundary).
   */
  public readonly code: ErrorCode;

  /**
   * Optional debugging payload: the original `Error`, the malformed value,
   * or any structured data that helps diagnose the problem.
   * Never include sensitive data here.
   */
  public readonly context?: unknown;

  /**
   * @param code    - Typed error code from {@link ErrorCode}.
   * @param message - Human-readable description in Spanish, suitable for display.
   * @param context - Optional contextual data for debugging (e.g. the original Error).
   */
  constructor(code: ErrorCode, message: string, context?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = context;

    // Maintains proper prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
