/**
 * @fileoverview Core domain types for the subscription manager.
 *
 * All types are defined with explicit string literals to enforce strict
 * domain constraints and prevent invalid states from being represented.
 */

/**
 * Billing frequency for a subscription.
 * - `"mensual"`: billed every month (factor 1)
 * - `"trimestral"`: billed every 3 months (factor 3)
 * - `"anual"`: billed every 12 months (factor 12)
 */
export type Frequency = "mensual" | "trimestral" | "anual";

/**
 * Lifecycle status of a subscription.
 * - `"activa"`: subscription is active and included in spending calculations.
 * - `"pausada"`: subscription is paused and excluded from calculations and alerts.
 */
export type SubscriptionStatus = "activa" | "pausada";

/**
 * Output format for exported reports.
 * - `"consola"`: plain-text summary suitable for terminal output.
 * - `"json"`:    structured JSON object with subscriptions and totals.
 * - `"csv"`:     comma-separated values with a header row and a totals row.
 */
export type ExportFormat = "consola" | "json" | "csv";

/**
 * Represents a single recurring subscription entry.
 *
 * All string fields are non-empty after trimming. Monetary amounts are strictly
 * positive finite numbers. Dates follow the ISO 8601 `YYYY-MM-DD` format and
 * must represent valid calendar dates.
 */
export interface Subscription {
  /** Universally unique identifier (UUID v4) generated with `crypto.randomUUID()`. */
  id: string;

  /** Human-readable subscription name. Must be non-empty after trim. */
  name: string;

  /** Billing amount in the given currency. Must be > 0 and finite. */
  amount: number;

  /** ISO 4217 currency code or any non-empty label (e.g. `"EUR"`, `"USD"`). */
  currency: string;

  /**
   * First billing date in `YYYY-MM-DD` format.
   * Must be a valid calendar date (e.g. `"2024-02-30"` is rejected).
   */
  startDate: string;

  /** Billing frequency. Determines the normalization factor for spending calculations. */
  frequency: Frequency;

  /** Current lifecycle status. Only `"activa"` subscriptions are included in calculations. */
  status: SubscriptionStatus;
}

/**
 * Input required to create a new subscription.
 *
 * The `id` field is intentionally omitted because it is generated internally
 * by `createSubscription` using `crypto.randomUUID()`.
 */
export type CreateSubscriptionInput = Omit<Subscription, "id">;

/**
 * Input for partially updating an existing subscription.
 *
 * All fields are optional — only the provided fields are modified.
 * The `id` field cannot be updated and must never appear in this type.
 *
 * @example
 * // Pause a subscription:
 * const patch: UpdateSubscriptionInput = { status: "pausada" };
 */
export type UpdateSubscriptionInput = Partial<Omit<Subscription, "id">>;

/**
 * Aggregated spending summary computed from active subscriptions.
 *
 * All values are computed from subscriptions with status `"activa"` only.
 */
export interface SpendingSummary {
  /**
   * Sum of each active subscription's amount divided by its frequency factor.
   * - Monthly factor: 1
   * - Quarterly factor: 3
   * - Annual factor: 12
   */
  monthlyNormalized: number;

  /**
   * Annual projection, computed as `monthlyNormalized * 12`.
   */
  annualProjected: number;
}

/**
 * Defines a time window used to compute upcoming renewal alerts.
 *
 * Only active subscriptions whose next charge date falls within
 * `[referenceDate, referenceDate + horizonDays]` (inclusive) are included.
 */
export interface AlertWindow {
  /** The reference date (today) in `YYYY-MM-DD` format. */
  referenceDate: string;

  /**
   * Number of calendar days ahead to look for upcoming charges.
   * Must be >= 0. Defaults to 7.
   */
  horizonDays: number;

  /**
   * Active subscriptions whose next charge falls within the alert window.
   * Paused subscriptions are always excluded.
   */
  subscriptions: Subscription[];
}

/**
 * Result of a report export operation.
 *
 * The `content` field holds the final, ready-to-use string representation
 * regardless of the chosen format.
 */
export interface ExportResult {
  /** The format used to generate the export. */
  format: ExportFormat;

  /**
   * Serialized report content.
   * - `"consola"`: human-readable multi-line string.
   * - `"json"`:    JSON string (may be parsed back with `JSON.parse`).
   * - `"csv"`:     CSV string with header and optional totals row.
   */
  content: string;
}
