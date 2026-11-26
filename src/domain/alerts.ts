/**
 * @fileoverview Pure date logic for upcoming charges and renewal alert windows.
 *
 * Dates are treated as UTC calendar dates without a time component. All month
 * arithmetic clamps the day to the last valid day of the target month, so
 * end-of-month and leap-day start dates behave predictably (e.g. a monthly
 * subscription starting on January 31st charges on February 29th in a leap
 * year and on February 28th otherwise).
 */

import { AppError } from "../errors/AppError.js";
import type { AlertWindow, Frequency, Subscription } from "./types.js";

/** Default alert horizon, in calendar days, when none is provided. */
const DEFAULT_HORIZON_DAYS = 7;

/** Number of months between two consecutive charges for each frequency. */
const FREQUENCY_MONTHS: Record<Frequency, number> = {
  mensual: 1,
  trimestral: 3,
  anual: 12,
};

/** Milliseconds in one calendar day. */
const MS_PER_DAY = 86_400_000;

/** Strict `YYYY-MM-DD` shape check. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a `YYYY-MM-DD` string into a UTC midnight timestamp, rejecting
 * malformed strings and impossible calendar dates such as `2024-02-30`.
 *
 * @param value - Raw date string to parse.
 * @param field - Field name reported in the error context.
 * @param label - Human-readable field label used in the error message.
 * @returns The UTC timestamp corresponding to midnight of the given date.
 * @throws {AppError} With code `VALIDATION_ERROR` if the date is invalid.
 */
function parseIsoDate(value: string, field: string, label: string): number {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `La ${label} debe seguir el formato YYYY-MM-DD y ser una fecha de calendario válida.`,
      { field, received: value }
    );
  }

  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  const isValidCalendarDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isValidCalendarDate) {
    throw new AppError(
      "VALIDATION_ERROR",
      `La ${label} debe seguir el formato YYYY-MM-DD y ser una fecha de calendario válida.`,
      { field, received: value }
    );
  }

  return timestamp;
}

/**
 * Formats a UTC timestamp as a `YYYY-MM-DD` calendar date.
 *
 * @param timestamp - UTC timestamp to format.
 * @returns The date portion in `YYYY-MM-DD` format.
 */
function formatIsoDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Adds a whole number of months to a UTC timestamp, clamping the day to the
 * last day of the target month when necessary.
 *
 * The calculation always starts from the original date, so repeated billing
 * periods do not drift (January 31st + 2 months is March 31st, not March 29th).
 *
 * @param timestamp - Base UTC timestamp.
 * @param months - Number of months to add (may be zero).
 * @returns The resulting UTC timestamp.
 */
function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();
  const targetDay = Math.min(date.getUTCDate(), lastDayOfTargetMonth);
  return Date.UTC(targetYear, targetMonth, targetDay);
}

/**
 * Computes the timestamp of the first charge on or after the reference date.
 *
 * @param subscription - Subscription providing `startDate` and `frequency`.
 * @param referenceTimestamp - Reference date as a UTC timestamp.
 * @returns The next charge timestamp, always `>= referenceTimestamp`.
 */
function nextChargeTimestamp(
  subscription: Subscription,
  referenceTimestamp: number
): number {
  const startTimestamp = parseIsoDate(
    subscription.startDate,
    "startDate",
    "fecha de inicio"
  );

  if (startTimestamp >= referenceTimestamp) {
    return startTimestamp;
  }

  const stepMonths = FREQUENCY_MONTHS[subscription.frequency];
  const start = new Date(startTimestamp);
  const reference = new Date(referenceTimestamp);
  const elapsedMonths =
    (reference.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (reference.getUTCMonth() - start.getUTCMonth());

  // Start from the ceiling of elapsed periods; at least one period has passed
  // because `startTimestamp < referenceTimestamp`.
  let periods = Math.max(1, Math.ceil(elapsedMonths / stepMonths));
  let candidate = addMonths(startTimestamp, periods * stepMonths);

  // Day-level clamping can leave the candidate slightly before the reference
  // date (e.g. short months), so advance one full period when needed.
  while (candidate < referenceTimestamp) {
    periods += 1;
    candidate = addMonths(startTimestamp, periods * stepMonths);
  }

  return candidate;
}

/**
 * Calculates the next charge date of a subscription on or after the reference
 * date, advancing `startDate` in exact frequency increments (1, 3 or 12
 * months) and clamping to the last day of short months.
 *
 * @param subscription - Subscription whose next charge is requested.
 * @param referenceDate - Reference date in `YYYY-MM-DD` format (typically today).
 * @returns The next charge date in `YYYY-MM-DD` format, always `>= referenceDate`.
 * @throws {AppError} With code `VALIDATION_ERROR` if either date is invalid.
 *
 * @example
 * computeNextChargeDate(
 *   { ..., startDate: "2024-01-31", frequency: "mensual" },
 *   "2024-02-01"
 * ); // => "2024-02-29"
 */
export function computeNextChargeDate(
  subscription: Subscription,
  referenceDate: string
): string {
  const referenceTimestamp = parseIsoDate(
    referenceDate,
    "referenceDate",
    "fecha de referencia"
  );

  return formatIsoDate(nextChargeTimestamp(subscription, referenceTimestamp));
}

/**
 * Returns the active subscriptions whose next charge falls within
 * `[referenceDate, referenceDate + horizonDays]`, both bounds inclusive.
 *
 * Paused subscriptions are always excluded. The result preserves the input
 * order and the input array is never mutated.
 *
 * @param subscriptions - Subscriptions to inspect.
 * @param referenceDate - Reference date in `YYYY-MM-DD` format (typically today).
 * @param horizonDays - Number of calendar days ahead to include. Defaults to 7.
 * @returns An {@link AlertWindow} with the matching active subscriptions.
 * @throws {AppError} With code `VALIDATION_ERROR` if `referenceDate` is invalid
 * or `horizonDays` is negative or not a finite number.
 */
export function getAlertWindow(
  subscriptions: Subscription[],
  referenceDate: string,
  horizonDays: number = DEFAULT_HORIZON_DAYS
): AlertWindow {
  const referenceTimestamp = parseIsoDate(
    referenceDate,
    "referenceDate",
    "fecha de referencia"
  );

  if (
    typeof horizonDays !== "number" ||
    !Number.isFinite(horizonDays) ||
    horizonDays < 0
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El horizonte de alerta debe ser un número de días mayor o igual que 0.",
      { field: "horizonDays", received: horizonDays }
    );
  }

  const horizonEndTimestamp = referenceTimestamp + horizonDays * MS_PER_DAY;

  const matching = subscriptions.filter((subscription) => {
    if (subscription.status !== "activa") {
      return false;
    }

    const chargeTimestamp = nextChargeTimestamp(subscription, referenceTimestamp);
    return (
      chargeTimestamp >= referenceTimestamp &&
      chargeTimestamp <= horizonEndTimestamp
    );
  });

  return {
    referenceDate,
    horizonDays,
    subscriptions: matching,
  };
}
