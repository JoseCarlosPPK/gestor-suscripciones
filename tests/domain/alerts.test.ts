/**
 * @fileoverview Unit and property-based tests for next charge dates and alert
 * windows (REQ-5).
 *
 * Covers acceptance criteria 5.1–5.5 and properties 8 and 9: correctness of
 * the next charge date, completeness/integrity of the alert window, and the
 * exclusion of paused subscriptions.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AppError } from "../../src/errors/AppError.js";
import type { Frequency, Subscription } from "../../src/domain/types.js";
import {
  computeNextChargeDate,
  getAlertWindow,
} from "../../src/domain/alerts.js";

const FREQUENCIES: Frequency[] = ["mensual", "trimestral", "anual"];
const FREQUENCY_MONTHS: Record<Frequency, number> = {
  mensual: 1,
  trimestral: 3,
  anual: 12,
};
const MS_PER_DAY = 86_400_000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)]!;
}

/** Converts a `YYYY-MM-DD` string to a UTC midnight timestamp. */
function toTimestamp(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/** Formats a UTC timestamp as `YYYY-MM-DD`. */
function toIsoDate(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Independent oracle for month arithmetic: adds whole months to a calendar
 * date, clamping the day to the last day of the target month.
 */
function addMonthsClamped(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthIndex = year! * 12 + (month! - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return toIsoDate(Date.UTC(targetYear, targetMonth, Math.min(day!, lastDay)));
}

/** Adds calendar days to an ISO date. */
function addDays(isoDate: string, days: number): string {
  return toIsoDate(toTimestamp(isoDate) + days * MS_PER_DAY);
}

/**
 * Independent oracle for the next charge date: iterates frequency increments
 * from `startDate` until reaching the first date on or after `referenceDate`.
 */
function oracleNextChargeDate(subscription: Subscription, referenceDate: string): string {
  const stepMonths = FREQUENCY_MONTHS[subscription.frequency];
  const reference = toTimestamp(referenceDate);

  for (let increment = 0; increment < 600; increment++) {
    const candidate = addMonthsClamped(subscription.startDate, increment * stepMonths);
    if (toTimestamp(candidate) >= reference) {
      return candidate;
    }
  }

  throw new Error("Oracle exhausted: no next charge date found within 600 increments");
}

function randomIsoDate(minYear: number, maxYear: number): string {
  const year = randomInt(minYear, maxYear);
  const month = randomInt(1, 12);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = randomInt(1, maxDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: overrides.id ?? `00000000-0000-4000-8000-${String(randomInt(1, 999999)).padStart(12, "0")}`,
    name: overrides.name ?? "Netflix",
    amount: overrides.amount ?? 12,
    currency: overrides.currency ?? "EUR",
    startDate: overrides.startDate ?? "2024-01-15",
    frequency: overrides.frequency ?? "mensual",
    status: overrides.status ?? "activa",
  };
}

function isValidationError(error: unknown): boolean {
  return error instanceof AppError && error.code === "VALIDATION_ERROR";
}

describe("Alerts: computeNextChargeDate (unit)", () => {
  it("should return startDate when it is equal to or after the reference date", () => {
    const monthly = subscription({ startDate: "2024-01-15", frequency: "mensual" });

    assert.strictEqual(computeNextChargeDate(monthly, "2024-01-15"), "2024-01-15");
    assert.strictEqual(computeNextChargeDate(monthly, "2023-12-31"), "2024-01-15");
    assert.strictEqual(computeNextChargeDate(monthly, "2020-06-01"), "2024-01-15");
  });

  it("should advance monthly subscriptions in exact one-month increments", () => {
    const monthly = subscription({ startDate: "2024-01-15", frequency: "mensual" });

    assert.strictEqual(computeNextChargeDate(monthly, "2024-01-16"), "2024-02-15");
    assert.strictEqual(computeNextChargeDate(monthly, "2024-02-15"), "2024-02-15");
    assert.strictEqual(computeNextChargeDate(monthly, "2024-02-16"), "2024-03-15");
    assert.strictEqual(computeNextChargeDate(monthly, "2024-12-16"), "2025-01-15");
  });

  it("should advance quarterly subscriptions in exact three-month increments", () => {
    const quarterly = subscription({ startDate: "2024-01-15", frequency: "trimestral" });

    assert.strictEqual(computeNextChargeDate(quarterly, "2024-01-16"), "2024-04-15");
    assert.strictEqual(computeNextChargeDate(quarterly, "2024-04-15"), "2024-04-15");
    assert.strictEqual(computeNextChargeDate(quarterly, "2024-04-16"), "2024-07-15");
    assert.strictEqual(computeNextChargeDate(quarterly, "2025-01-16"), "2025-04-15");
  });

  it("should advance annual subscriptions in exact twelve-month increments", () => {
    const annual = subscription({ startDate: "2024-01-15", frequency: "anual" });

    assert.strictEqual(computeNextChargeDate(annual, "2024-01-16"), "2025-01-15");
    assert.strictEqual(computeNextChargeDate(annual, "2025-01-15"), "2025-01-15");
    assert.strictEqual(computeNextChargeDate(annual, "2025-01-16"), "2026-01-15");
  });

  it("should never return a date earlier than the reference date", () => {
    const cases: Array<[Subscription, string]> = [
      [subscription({ startDate: "2023-11-30", frequency: "mensual" }), "2024-02-29"],
      [subscription({ startDate: "2022-02-28", frequency: "trimestral" }), "2024-03-01"],
      [subscription({ startDate: "2020-02-29", frequency: "anual" }), "2024-02-29"],
      [subscription({ startDate: "2024-01-31", frequency: "mensual" }), "2024-04-30"],
      [subscription({ startDate: "2024-05-31", frequency: "trimestral" }), "2025-01-01"],
    ];

    for (const [item, referenceDate] of cases) {
      const nextCharge = computeNextChargeDate(item, referenceDate);
      assert.ok(
        toTimestamp(nextCharge) >= toTimestamp(referenceDate),
        `${nextCharge} must be >= ${referenceDate}`
      );
    }
  });

  it("should clamp to the last day of the month for end-of-month start dates", () => {
    const monthly = subscription({ startDate: "2024-01-31", frequency: "mensual" });

    assert.strictEqual(computeNextChargeDate(monthly, "2024-02-01"), "2024-02-29");
    assert.strictEqual(computeNextChargeDate(monthly, "2024-02-29"), "2024-02-29");
    assert.strictEqual(computeNextChargeDate(monthly, "2024-03-01"), "2024-03-31");
    assert.strictEqual(computeNextChargeDate(monthly, "2024-04-01"), "2024-04-30");
    assert.strictEqual(computeNextChargeDate(monthly, "2024-03-31"), "2024-03-31");
  });

  it("should clamp end-of-month start dates in non-leap years", () => {
    const monthly = subscription({ startDate: "2023-01-31", frequency: "mensual" });

    assert.strictEqual(computeNextChargeDate(monthly, "2023-02-01"), "2023-02-28");
    assert.strictEqual(computeNextChargeDate(monthly, "2023-02-28"), "2023-02-28");
    assert.strictEqual(computeNextChargeDate(monthly, "2023-03-01"), "2023-03-31");
  });

  it("should handle leap-day start dates across leap and non-leap years", () => {
    const annual = subscription({ startDate: "2024-02-29", frequency: "anual" });

    assert.strictEqual(computeNextChargeDate(annual, "2024-02-29"), "2024-02-29");
    assert.strictEqual(computeNextChargeDate(annual, "2025-02-28"), "2025-02-28");
    assert.strictEqual(computeNextChargeDate(annual, "2025-03-01"), "2026-02-28");
    assert.strictEqual(computeNextChargeDate(annual, "2028-01-01"), "2028-02-29");

    const quarterly = subscription({ startDate: "2024-02-29", frequency: "trimestral" });
    assert.strictEqual(computeNextChargeDate(quarterly, "2024-05-29"), "2024-05-29");
    assert.strictEqual(computeNextChargeDate(quarterly, "2025-02-28"), "2025-02-28");
  });

  it("should reject an invalid reference date with VALIDATION_ERROR", () => {
    const monthly = subscription({ startDate: "2024-01-15" });

    for (const invalid of ["2024-02-30", "15-01-2024", "2024-1-5", "", "not-a-date"]) {
      assert.throws(
        () => computeNextChargeDate(monthly, invalid),
        isValidationError,
        `reference date ${invalid} should be rejected`
      );
    }
  });
});

describe("Alerts: getAlertWindow (unit)", () => {
  const referenceDate = "2024-06-10";

  const sample: Subscription[] = [
    subscription({ id: "due-today", startDate: "2024-06-10", frequency: "mensual", status: "activa" }),
    subscription({ id: "due-last-day", startDate: "2024-06-17", frequency: "mensual", status: "activa" }),
    subscription({ id: "after-window", startDate: "2024-06-18", frequency: "mensual", status: "activa" }),
    subscription({ id: "paused-due-today", startDate: "2024-06-10", frequency: "mensual", status: "pausada" }),
    subscription({ id: "annual-in-window", startDate: "2024-06-12", frequency: "anual", status: "activa" }),
  ];

  it("should use a default horizon of 7 days with inclusive bounds", () => {
    const window = getAlertWindow(sample, referenceDate);

    assert.strictEqual(window.referenceDate, referenceDate);
    assert.strictEqual(window.horizonDays, 7);
    assert.deepStrictEqual(
      window.subscriptions.map((item) => item.id),
      ["due-today", "due-last-day", "annual-in-window"]
    );
  });

  it("should only include exact-day charges when the horizon is 0", () => {
    const subscriptions = [
      subscription({ id: "exact", startDate: "2024-06-10", frequency: "mensual" }),
      subscription({ id: "previous-month", startDate: "2024-05-10", frequency: "mensual" }),
      subscription({ id: "tomorrow", startDate: "2024-06-11", frequency: "mensual" }),
      subscription({ id: "annual-exact", startDate: "2023-06-10", frequency: "anual" }),
      subscription({ id: "paused-exact", startDate: "2024-06-10", frequency: "mensual", status: "pausada" }),
    ];

    const window = getAlertWindow(subscriptions, referenceDate, 0);

    assert.strictEqual(window.horizonDays, 0);
    assert.deepStrictEqual(
      window.subscriptions.map((item) => item.id),
      ["exact", "previous-month", "annual-exact"]
    );
  });

  it("should respect an explicit horizon and exclude charges beyond it", () => {
    const subscriptions = [
      subscription({ id: "at-limit", startDate: "2024-06-24", frequency: "mensual" }),
      subscription({ id: "past-limit", startDate: "2024-06-25", frequency: "mensual" }),
      subscription({ id: "before-limit", startDate: "2024-06-23", frequency: "mensual" }),
    ];

    const window = getAlertWindow(subscriptions, referenceDate, 14);

    assert.strictEqual(window.horizonDays, 14);
    assert.deepStrictEqual(
      window.subscriptions.map((item) => item.id),
      ["at-limit", "before-limit"]
    );
  });

  it("should always exclude paused subscriptions", () => {
    const subscriptions = [
      subscription({ id: "paused-1", startDate: "2024-06-10", frequency: "mensual", status: "pausada" }),
      subscription({ id: "paused-2", startDate: "2024-06-12", frequency: "trimestral", status: "pausada" }),
      subscription({ id: "active", startDate: "2024-06-12", frequency: "mensual", status: "activa" }),
    ];

    const window = getAlertWindow(subscriptions, referenceDate, 30);

    assert.deepStrictEqual(window.subscriptions.map((item) => item.id), ["active"]);
  });

  it("should return an empty window for an empty subscription list", () => {
    assert.deepStrictEqual(getAlertWindow([], referenceDate), {
      referenceDate,
      horizonDays: 7,
      subscriptions: [],
    });
  });

  it("should not mutate the input list or its subscriptions", () => {
    const snapshot = structuredClone(sample);
    getAlertWindow(sample, referenceDate, 14);
    assert.deepStrictEqual(sample, snapshot);
  });

  it("should throw VALIDATION_ERROR when the horizon is negative or not finite", () => {
    for (const horizon of [-1, -0.5, -7, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => getAlertWindow(sample, referenceDate, horizon),
        isValidationError,
        `horizon ${String(horizon)} should be rejected`
      );
    }
  });

  it("should reject an invalid reference date with VALIDATION_ERROR", () => {
    for (const invalid of ["2024-02-30", "10-06-2024", "2024-13-01", ""]) {
      assert.throws(
        () => getAlertWindow(sample, invalid),
        isValidationError,
        `reference date ${invalid} should be rejected`
      );
    }
  });
});

describe("Alerts: Property 8 — Corrección del próximo cobro", () => {
  it("should return a reachable date >= referenceDate across 150+ random pairs", () => {
    for (let iteration = 0; iteration < 150; iteration++) {
      const item = subscription({
        startDate: randomIsoDate(2020, 2028),
        frequency: randomChoice(FREQUENCIES),
      });
      const referenceDate = randomIsoDate(2019, 2030);
      const stepMonths = FREQUENCY_MONTHS[item.frequency];

      const nextCharge = computeNextChargeDate(item, referenceDate);
      const expected = oracleNextChargeDate(item, referenceDate);

      assert.strictEqual(
        nextCharge,
        expected,
        `iteration ${iteration}: start=${item.startDate} freq=${item.frequency} ref=${referenceDate}`
      );

      assert.ok(
        toTimestamp(nextCharge) >= toTimestamp(referenceDate),
        `iteration ${iteration}: ${nextCharge} must be >= ${referenceDate}`
      );

      let reachable = false;
      for (let increment = 0; increment < 600; increment++) {
        if (addMonthsClamped(item.startDate, increment * stepMonths) === nextCharge) {
          reachable = true;
          break;
        }
      }
      assert.ok(
        reachable,
        `iteration ${iteration}: ${nextCharge} is not reachable from ${item.startDate}`
      );
    }
  });
});

describe("Alerts: Property 9 — Completitud e integridad de la ventana", () => {
  it("should return exactly the active subscriptions inside the window across 120+ random sets", () => {
    for (let iteration = 0; iteration < 120; iteration++) {
      const referenceDate = randomIsoDate(2024, 2028);
      const horizonDays = randomInt(0, 90);

      const subscriptions = [
        ...Array.from({ length: randomInt(0, 6) }, () =>
          subscription({
            id: `active-${iteration}-${randomInt(0, 999999)}`,
            startDate: randomIsoDate(2023, 2028),
            frequency: randomChoice(FREQUENCIES),
            status: "activa",
          })
        ),
        ...Array.from({ length: randomInt(0, 4) }, () =>
          subscription({
            id: `paused-${iteration}-${randomInt(0, 999999)}`,
            startDate: randomIsoDate(2023, 2028),
            frequency: randomChoice(FREQUENCIES),
            status: "pausada",
          })
        ),
      ];

      const windowEnd = addDays(referenceDate, horizonDays);
      const expectedIds = subscriptions
        .filter((item) => {
          if (item.status !== "activa") return false;
          const nextCharge = oracleNextChargeDate(item, referenceDate);
          return (
            toTimestamp(nextCharge) >= toTimestamp(referenceDate) &&
            toTimestamp(nextCharge) <= toTimestamp(windowEnd)
          );
        })
        .map((item) => item.id);

      const window = getAlertWindow(subscriptions, referenceDate, horizonDays);

      assert.strictEqual(window.referenceDate, referenceDate, `iteration ${iteration}`);
      assert.strictEqual(window.horizonDays, horizonDays, `iteration ${iteration}`);
      assert.deepStrictEqual(
        window.subscriptions.map((item) => item.id),
        expectedIds,
        `iteration ${iteration}: ref=${referenceDate} horizon=${horizonDays}`
      );

      for (const item of window.subscriptions) {
        assert.strictEqual(item.status, "activa", `iteration ${iteration}`);
        const nextCharge = oracleNextChargeDate(item, referenceDate);
        assert.ok(
          toTimestamp(nextCharge) >= toTimestamp(referenceDate),
          `iteration ${iteration}: charge before window`
        );
        assert.ok(
          toTimestamp(nextCharge) <= toTimestamp(windowEnd),
          `iteration ${iteration}: charge after window`
        );
      }
    }
  });

  it("should include only exact-day charges with horizon 0 across 100+ random sets", () => {
    for (let iteration = 0; iteration < 100; iteration++) {
      const referenceDate = randomIsoDate(2024, 2028);
      const subscriptions = Array.from({ length: randomInt(0, 8) }, () =>
        subscription({
          id: `sub-${iteration}-${randomInt(0, 999999)}`,
          startDate: randomIsoDate(2023, 2028),
          frequency: randomChoice(FREQUENCIES),
          status: randomChoice(["activa", "pausada"] as const),
        })
      );

      const expectedIds = subscriptions
        .filter(
          (item) =>
            item.status === "activa" &&
            oracleNextChargeDate(item, referenceDate) === referenceDate
        )
        .map((item) => item.id);

      const window = getAlertWindow(subscriptions, referenceDate, 0);

      assert.deepStrictEqual(
        window.subscriptions.map((item) => item.id),
        expectedIds,
        `iteration ${iteration}: ref=${referenceDate}`
      );
    }
  });
});
