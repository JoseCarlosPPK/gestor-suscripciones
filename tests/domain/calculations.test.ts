/**
 * @fileoverview Unit and property-based tests for normalized spending (REQ-4).
 *
 * Covers acceptance criteria 4.1–4.4 and properties 6 and 7:
 * monthly/annual relationship, exclusion of paused subscriptions, and non-negativity.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Frequency, Subscription, SubscriptionStatus } from "../../src/domain/types.js";
import {
  computeAnnualProjected,
  computeMonthlyNormalized,
  computeSpendingSummary,
} from "../../src/domain/calculations.js";

const FREQUENCIES: Frequency[] = ["mensual", "trimestral", "anual"];
const STATUSES: SubscriptionStatus[] = ["activa", "pausada"];
const CURRENCIES = ["EUR", "USD", "GBP"];
const NAMES = ["Netflix", "Spotify", "iCloud", "Notion", "HBO", "GitHub"];

const FACTOR: Record<Frequency, number> = {
  mensual: 1,
  trimestral: 3,
  anual: 12,
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)]!;
}

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  const frequency = overrides.frequency ?? "mensual";
  return {
    id: overrides.id ?? `00000000-0000-4000-8000-${String(randomInt(1, 999999)).padStart(12, "0")}`,
    name: overrides.name ?? randomChoice(NAMES),
    amount: overrides.amount ?? 12,
    currency: overrides.currency ?? "EUR",
    startDate: overrides.startDate ?? "2024-01-15",
    frequency,
    status: overrides.status ?? "activa",
  };
}

function randomSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return subscription({
    name: `${randomChoice(NAMES)} ${randomInt(1, 999)}`,
    amount: Number((Math.random() * 240 + 0.01).toFixed(2)),
    currency: randomChoice(CURRENCIES),
    startDate: `2024-${String(randomInt(1, 12)).padStart(2, "0")}-${String(randomInt(1, 28)).padStart(2, "0")}`,
    frequency: randomChoice(FREQUENCIES),
    status: randomChoice(STATUSES),
    ...overrides,
  });
}

/** Expected monthly total using the same factors as the specification. */
function expectedMonthly(subscriptions: Subscription[]): number {
  return subscriptions
    .filter((item) => item.status === "activa")
    .reduce((sum, item) => sum + item.amount / FACTOR[item.frequency], 0);
}

describe("Calculations: computeMonthlyNormalized (unit)", () => {
  it("should divide monthly, quarterly and annual amounts by 1, 3 and 12", () => {
    const subscriptions = [
      subscription({ amount: 15, frequency: "mensual", status: "activa" }),
      subscription({ amount: 30, frequency: "trimestral", status: "activa" }),
      subscription({ amount: 120, frequency: "anual", status: "activa" }),
    ];

    assert.strictEqual(computeMonthlyNormalized(subscriptions), 15 + 10 + 10);
  });

  it("should sum a mix of frequencies and ignore paused subscriptions", () => {
    const subscriptions = [
      subscription({ amount: 10, frequency: "mensual", status: "activa" }),
      subscription({ amount: 60, frequency: "trimestral", status: "activa" }),
      subscription({ amount: 999, frequency: "anual", status: "pausada" }),
    ];

    assert.strictEqual(computeMonthlyNormalized(subscriptions), 10 + 20);
  });

  it("should return 0 when every subscription is paused", () => {
    const subscriptions = [
      subscription({ amount: 40, frequency: "mensual", status: "pausada" }),
      subscription({ amount: 90, frequency: "trimestral", status: "pausada" }),
    ];

    assert.strictEqual(computeMonthlyNormalized(subscriptions), 0);
  });

  it("should return 0 for an empty list", () => {
    assert.strictEqual(computeMonthlyNormalized([]), 0);
  });

  it("should not mutate the input list", () => {
    const subscriptions = [subscription({ amount: 12, frequency: "mensual" })];
    const snapshot = structuredClone(subscriptions);

    computeMonthlyNormalized(subscriptions);

    assert.deepStrictEqual(subscriptions, snapshot);
  });
});

describe("Calculations: computeAnnualProjected (unit)", () => {
  it("should equal the normalized monthly total multiplied by 12", () => {
    const subscriptions = [
      subscription({ amount: 15, frequency: "mensual", status: "activa" }),
      subscription({ amount: 30, frequency: "trimestral", status: "pausada" }),
      subscription({ amount: 24, frequency: "anual", status: "activa" }),
    ];

    const monthly = computeMonthlyNormalized(subscriptions);
    assert.strictEqual(computeAnnualProjected(subscriptions), monthly * 12);
    assert.strictEqual(computeAnnualProjected(subscriptions), (15 + 2) * 12);
  });

  it("should return 0 for an empty list and for an all-paused list", () => {
    assert.strictEqual(computeAnnualProjected([]), 0);
    assert.strictEqual(
      computeAnnualProjected([subscription({ amount: 50, status: "pausada" })]),
      0
    );
  });
});

describe("Calculations: computeSpendingSummary (unit)", () => {
  it("should return both the monthly normalized total and the annual projection", () => {
    const subscriptions = [
      subscription({ amount: 12, frequency: "mensual", status: "activa" }),
      subscription({ amount: 36, frequency: "trimestral", status: "activa" }),
      subscription({ amount: 48, frequency: "anual", status: "pausada" }),
    ];

    const summary = computeSpendingSummary(subscriptions);

    assert.deepStrictEqual(summary, {
      monthlyNormalized: 12 + 12,
      annualProjected: 24 * 12,
    });
  });

  it("should return zeros when there are no active subscriptions", () => {
    assert.deepStrictEqual(computeSpendingSummary([]), {
      monthlyNormalized: 0,
      annualProjected: 0,
    });
    assert.deepStrictEqual(
      computeSpendingSummary([
        subscription({ status: "pausada", amount: 80, frequency: "anual" }),
      ]),
      { monthlyNormalized: 0, annualProjected: 0 }
    );
  });
});

describe("Calculations: Property 6 — Relación mensual / anual", () => {
  it("should keep annualProjected equal to monthlyNormalized * 12 across 100+ mixed sets", () => {
    for (let iteration = 0; iteration < 120; iteration++) {
      const count = randomInt(0, 12);
      const subscriptions = Array.from({ length: count }, () => randomSubscription());
      const summary = computeSpendingSummary(subscriptions);

      assert.strictEqual(
        summary.annualProjected,
        summary.monthlyNormalized * 12,
        `iteration ${iteration}`
      );
      assert.strictEqual(
        summary.monthlyNormalized,
        computeMonthlyNormalized(subscriptions),
        `iteration ${iteration}`
      );
      assert.strictEqual(
        summary.annualProjected,
        computeAnnualProjected(subscriptions),
        `iteration ${iteration}`
      );
    }
  });
});

describe("Calculations: Property 7 — Exclusión de pausadas y no negatividad", () => {
  it("should return zero totals when every subscription is paused across 100+ iterations", () => {
    for (let iteration = 0; iteration < 100; iteration++) {
      const count = randomInt(0, 8);
      const subscriptions = Array.from({ length: count }, () =>
        randomSubscription({ status: "pausada" })
      );
      const summary = computeSpendingSummary(subscriptions);

      assert.strictEqual(summary.monthlyNormalized, 0, `iteration ${iteration}`);
      assert.strictEqual(summary.annualProjected, 0, `iteration ${iteration}`);
    }
  });

  it("should ignore changes to a paused amount in a mixed set across 100+ iterations", () => {
    for (let iteration = 0; iteration < 100; iteration++) {
      const activeCount = randomInt(1, 6);
      const pausedCount = randomInt(1, 4);
      const subscriptions = [
        ...Array.from({ length: activeCount }, () => randomSubscription({ status: "activa" })),
        ...Array.from({ length: pausedCount }, () => randomSubscription({ status: "pausada" })),
      ];

      const before = computeSpendingSummary(subscriptions);
      const pausedIndex = subscriptions.findIndex((item) => item.status === "pausada");
      const mutated = subscriptions.map((item, index) =>
        index === pausedIndex ? { ...item, amount: item.amount + randomInt(1, 500) } : item
      );
      const after = computeSpendingSummary(mutated);

      assert.deepStrictEqual(after, before, `iteration ${iteration}`);
      assert.ok(before.monthlyNormalized >= 0, `iteration ${iteration}`);
      assert.ok(before.annualProjected >= 0, `iteration ${iteration}`);
      assert.ok(
        Math.abs(before.monthlyNormalized - expectedMonthly(subscriptions)) < 1e-9,
        `iteration ${iteration}`
      );
    }
  });

  it("should keep both totals non-negative for positive amounts across 100+ iterations", () => {
    for (let iteration = 0; iteration < 100; iteration++) {
      const subscriptions = Array.from({ length: randomInt(0, 10) }, () => randomSubscription());
      const summary = computeSpendingSummary(subscriptions);

      assert.ok(summary.monthlyNormalized >= 0, `iteration ${iteration}`);
      assert.ok(summary.annualProjected >= 0, `iteration ${iteration}`);
    }
  });
});
