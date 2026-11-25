/**
 * @fileoverview Unit and property-based tests for subscription creation (REQ-1).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AppError } from "../../src/errors/AppError.js";
import type {
  CreateSubscriptionInput,
  Frequency,
  Subscription,
  SubscriptionStatus,
} from "../../src/domain/types.js";
import { createSubscription } from "../../src/domain/subscriptions.js";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FREQUENCIES: Frequency[] = ["mensual", "trimestral", "anual"];
const STATUSES: SubscriptionStatus[] = ["activa", "pausada"];
const CURRENCIES = ["EUR", "USD", "GBP", "JPY"];
const NAMES = ["Netflix", "Spotify", "GitHub Copilot", "iCloud+", "HBO Max", "Notion"];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)]!;
}

function generateValidDate(): string {
  const year = randomInt(2020, 2027);
  const month = randomInt(1, 12);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = randomInt(1, maxDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function generateValidInput(): CreateSubscriptionInput {
  return {
    name: `${randomChoice(NAMES)} ${randomInt(1, 999)}`,
    amount: Number((Math.random() * 200 + 0.01).toFixed(2)),
    currency: randomChoice(CURRENCIES),
    startDate: generateValidDate(),
    frequency: randomChoice(FREQUENCIES),
    status: randomChoice(STATUSES),
  };
}

function generateCorruptedInput(): Record<string, unknown> {
  const base: Record<string, unknown> = { ...generateValidInput() };
  const corruptionType = randomInt(0, 6);

  switch (corruptionType) {
    case 0:
      base.name = randomChoice(["", "   ", "\t", null, 123]);
      break;
    case 1:
      base.amount = randomChoice([0, -1, -50.5, NaN, Infinity, -Infinity, "10"]);
      break;
    case 2:
      base.currency = randomChoice(["", "  ", null, 99]);
      break;
    case 3:
      base.startDate = randomChoice([
        "2024-02-30",
        "2023-02-29",
        "2024-13-01",
        "01-01-2024",
        "invalid",
        "",
      ]);
      break;
    case 4:
      base.frequency = randomChoice(["semanal", "diaria", "MENSUAL", "", 1]);
      break;
    case 5:
      base.status = randomChoice(["cancelada", "ACTIVA", "", null]);
      break;
    case 6: {
      const keys = ["name", "amount", "currency", "startDate", "frequency", "status"];
      delete base[randomChoice(keys)];
      break;
    }
  }

  return base;
}

describe("Subscriptions: createSubscription (unit)", () => {
  it("should create a subscription with a generated UUID v4 and return updated list", () => {
    const existing: Subscription[] = [];
    const input: CreateSubscriptionInput = {
      name: "Netflix",
      amount: 15.99,
      currency: "EUR",
      startDate: "2024-01-15",
      frequency: "mensual",
      status: "activa",
    };

    const { updated, created } = createSubscription(existing, input);

    assert.match(created.id, UUID_V4_REGEX);
    assert.strictEqual(created.name, "Netflix");
    assert.strictEqual(created.amount, 15.99);
    assert.strictEqual(created.currency, "EUR");
    assert.strictEqual(created.startDate, "2024-01-15");
    assert.strictEqual(created.frequency, "mensual");
    assert.strictEqual(created.status, "activa");

    assert.strictEqual(updated.length, 1);
    assert.deepStrictEqual(updated[0], created);
    assert.strictEqual(existing.length, 0, "existing array must not be mutated");
  });

  it("should not collide with pre-existing subscription IDs", () => {
    const existing: Subscription[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Spotify",
        amount: 9.99,
        currency: "EUR",
        startDate: "2024-02-01",
        frequency: "mensual",
        status: "activa",
      },
    ];

    const { updated, created } = createSubscription(existing, {
      name: "GitHub",
      amount: 10,
      currency: "USD",
      startDate: "2024-03-01",
      frequency: "mensual",
      status: "activa",
    });

    assert.strictEqual(updated.length, 2);
    assert.notStrictEqual(created.id, existing[0]!.id);
  });

  it("should reject invalid input and leave existing list untouched", () => {
    const existing: Subscription[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Spotify",
        amount: 9.99,
        currency: "EUR",
        startDate: "2024-02-01",
        frequency: "mensual",
        status: "activa",
      },
    ];

    assert.throws(
      () =>
        createSubscription(existing, {
          name: "   ",
          amount: 9.99,
          currency: "EUR",
          startDate: "2024-02-01",
          frequency: "mensual",
          status: "activa",
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR"
    );

    assert.strictEqual(existing.length, 1);
  });
});

describe("Subscriptions: Property 1 — Unicidad de IDs generados", () => {
  it("should generate unique UUID v4 IDs across 100+ sequential creations without colliding with existing IDs", () => {
    const preExistingId = "550e8400-e29b-41d4-a716-446655440000";

    for (let iteration = 0; iteration < 100; iteration++) {
      let current: Subscription[] = [
        {
          id: preExistingId,
          name: "Existing",
          amount: 5,
          currency: "EUR",
          startDate: "2024-01-01",
          frequency: "mensual",
          status: "activa",
        },
      ];

      const count = randomInt(3, 8);
      const generatedIds = new Set<string>();

      for (let i = 0; i < count; i++) {
        const result = createSubscription(current, generateValidInput());
        assert.match(result.created.id, UUID_V4_REGEX);
        assert.notStrictEqual(result.created.id, preExistingId);
        assert.ok(
          !generatedIds.has(result.created.id),
          `Duplicate ID generated in iteration ${iteration}: ${result.created.id}`
        );
        generatedIds.add(result.created.id);
        current = result.updated;
      }

      assert.strictEqual(current.length, 1 + count);
    }
  });
});

describe("Subscriptions: Property 2 — Rechazo de inputs inválidos en creación", () => {
  it("should throw VALIDATION_ERROR and keep list unchanged across 100+ corrupted inputs", () => {
    const baseline: Subscription[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Baseline",
        amount: 12,
        currency: "EUR",
        startDate: "2024-01-01",
        frequency: "mensual",
        status: "activa",
      },
    ];
    const snapshot = structuredClone(baseline);

    for (let iteration = 0; iteration < 120; iteration++) {
      const badInput = generateCorruptedInput() as CreateSubscriptionInput;

      assert.throws(
        () => createSubscription(baseline, badInput),
        (err: unknown) => {
          assert.ok(err instanceof AppError, `Iteration ${iteration}: expected AppError`);
          assert.strictEqual(
            err.code,
            "VALIDATION_ERROR",
            `Iteration ${iteration}: expected VALIDATION_ERROR, got ${err.code}`
          );
          return true;
        }
      );

      assert.deepStrictEqual(baseline, snapshot);
    }
  });
});
