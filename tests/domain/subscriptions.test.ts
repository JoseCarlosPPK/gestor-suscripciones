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
  UpdateSubscriptionInput,
} from "../../src/domain/types.js";
import {
  createSubscription,
  deleteSubscription,
  findById,
  updateSubscription,
} from "../../src/domain/subscriptions.js";

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

describe("Subscriptions: updateSubscription (unit)", () => {
  const sampleList: Subscription[] = [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Netflix",
      amount: 15.99,
      currency: "EUR",
      startDate: "2024-01-15",
      frequency: "mensual",
      status: "activa",
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Spotify",
      amount: 9.99,
      currency: "EUR",
      startDate: "2024-02-01",
      frequency: "mensual",
      status: "activa",
    },
  ];

  it("should throw NOT_FOUND when id does not exist", () => {
    assert.throws(
      () =>
        updateSubscription(sampleList, "00000000-0000-4000-8000-000000000999", {
          amount: 19.99,
        }),
      (err: unknown) => err instanceof AppError && err.code === "NOT_FOUND"
    );
  });

  it("should partially update only provided fields and preserve the rest", () => {
    const snapshot = structuredClone(sampleList);
    const { updated, subscription } = updateSubscription(
      sampleList,
      sampleList[0]!.id,
      { amount: 17.99, status: "pausada" }
    );

    assert.strictEqual(subscription.id, sampleList[0]!.id);
    assert.strictEqual(subscription.name, "Netflix");
    assert.strictEqual(subscription.amount, 17.99);
    assert.strictEqual(subscription.currency, "EUR");
    assert.strictEqual(subscription.startDate, "2024-01-15");
    assert.strictEqual(subscription.frequency, "mensual");
    assert.strictEqual(subscription.status, "pausada");

    assert.strictEqual(updated.length, 2);
    assert.deepStrictEqual(updated[0], subscription);
    assert.deepStrictEqual(updated[1], sampleList[1]);
    assert.deepStrictEqual(sampleList, snapshot, "existing list must not be mutated");
  });

  it("should be atomic and leave original list untouched if any field is invalid", () => {
    const snapshot = structuredClone(sampleList);

    assert.throws(
      () =>
        updateSubscription(sampleList, sampleList[0]!.id, {
          name: "Netflix Premium",
          amount: -5,
        }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR"
    );

    assert.deepStrictEqual(sampleList, snapshot);
  });

  it("should reject id modification with FORBIDDEN_FIELD", () => {
    const snapshot = structuredClone(sampleList);
    const patchWithId = {
      id: "550e8400-e29b-41d4-a716-446655449999",
      amount: 20,
    } as unknown as UpdateSubscriptionInput;

    assert.throws(
      () => updateSubscription(sampleList, sampleList[0]!.id, patchWithId),
      (err: unknown) => err instanceof AppError && err.code === "FORBIDDEN_FIELD"
    );

    assert.deepStrictEqual(sampleList, snapshot);
  });

  it("should be idempotent when updating with identical values", () => {
    const original = sampleList[0]!;
    const { updated, subscription } = updateSubscription(sampleList, original.id, {
      name: original.name,
      amount: original.amount,
      currency: original.currency,
      startDate: original.startDate,
      frequency: original.frequency,
      status: original.status,
    });

    assert.deepStrictEqual(subscription, original);
    assert.deepStrictEqual(updated, sampleList);
  });
});

describe("Subscriptions: Property 3 — Actualización parcial conserva campos no modificados", () => {
  it("should preserve all non-updated fields across 100+ random partial updates", () => {
    const updatableKeys = [
      "name",
      "amount",
      "currency",
      "startDate",
      "frequency",
      "status",
    ] as const;

    for (let iteration = 0; iteration < 120; iteration++) {
      const original: Subscription = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        ...generateValidInput(),
      };
      const existing: Subscription[] = [original];
      const freshValues = generateValidInput();

      // Pick a non-empty random subset of updatable fields
      const patch: UpdateSubscriptionInput = {};
      const selected = new Set<string>();
      const subsetSize = randomInt(1, updatableKeys.length);
      while (selected.size < subsetSize) {
        selected.add(randomChoice(updatableKeys));
      }

      for (const key of selected) {
        if (key === "name") patch.name = freshValues.name;
        if (key === "amount") patch.amount = freshValues.amount;
        if (key === "currency") patch.currency = freshValues.currency;
        if (key === "startDate") patch.startDate = freshValues.startDate;
        if (key === "frequency") patch.frequency = freshValues.frequency;
        if (key === "status") patch.status = freshValues.status;
      }

      const { subscription } = updateSubscription(existing, original.id, patch);

      assert.strictEqual(subscription.id, original.id);
      for (const key of updatableKeys) {
        if (selected.has(key)) {
          assert.strictEqual(subscription[key], patch[key]);
        } else {
          assert.strictEqual(subscription[key], original[key]);
        }
      }
    }
  });
});

describe("Subscriptions: Property 4 — Atomicidad de la edición", () => {
  it("should leave subscription state identical when mixing valid and invalid fields across 100+ iterations", () => {
    for (let iteration = 0; iteration < 120; iteration++) {
      const original: Subscription = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        ...generateValidInput(),
      };
      const existing: Subscription[] = [original];
      const snapshot = structuredClone(existing);

      const validPart = generateValidInput();
      const corrupted = generateCorruptedInput();
      // Ensure at least one valid field is mixed with an invalid field
      const badPatch: Record<string, unknown> = {
        name: validPart.name,
        amount: validPart.amount,
      };

      const invalidField = randomChoice([
        "name",
        "amount",
        "currency",
        "startDate",
        "frequency",
        "status",
      ] as const);

      if (invalidField === "name") badPatch.name = randomChoice(["", "  ", null]);
      if (invalidField === "amount") badPatch.amount = randomChoice([0, -10, NaN, Infinity]);
      if (invalidField === "currency") badPatch.currency = randomChoice(["", "   ", 42]);
      if (invalidField === "startDate") badPatch.startDate = randomChoice(["2024-02-30", "bad"]);
      if (invalidField === "frequency") badPatch.frequency = "semanal";
      if (invalidField === "status") badPatch.status = "cancelada";

      // Occasionally also test forbidden id field
      if (iteration % 10 === 0 && corrupted !== null) {
        badPatch.id = "another-id";
      }

      assert.throws(
        () =>
          updateSubscription(
            existing,
            original.id,
            badPatch as UpdateSubscriptionInput
          ),
        (err: unknown) =>
          err instanceof AppError &&
          (err.code === "VALIDATION_ERROR" || err.code === "FORBIDDEN_FIELD")
      );

      assert.deepStrictEqual(existing, snapshot);
    }
  });
});

describe("Subscriptions: findById (unit)", () => {
  const sampleList: Subscription[] = [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Netflix",
      amount: 15.99,
      currency: "EUR",
      startDate: "2024-01-15",
      frequency: "mensual",
      status: "activa",
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Spotify",
      amount: 9.99,
      currency: "EUR",
      startDate: "2024-02-01",
      frequency: "mensual",
      status: "activa",
    },
  ];

  it("should return the subscription matching the given id", () => {
    const found = findById(sampleList, sampleList[1]!.id);
    assert.deepStrictEqual(found, sampleList[1]);
  });

  it("should throw NOT_FOUND when id does not exist", () => {
    assert.throws(
      () => findById(sampleList, "00000000-0000-4000-8000-000000000999"),
      (err: unknown) => err instanceof AppError && err.code === "NOT_FOUND"
    );
  });
});

describe("Subscriptions: deleteSubscription (unit)", () => {
  const sampleList: Subscription[] = [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Netflix",
      amount: 15.99,
      currency: "EUR",
      startDate: "2024-01-15",
      frequency: "mensual",
      status: "activa",
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Spotify",
      amount: 9.99,
      currency: "EUR",
      startDate: "2024-02-01",
      frequency: "mensual",
      status: "activa",
    },
  ];

  it("should delete an existing subscription, reduce length by 1, and preserve the rest", () => {
    const snapshot = structuredClone(sampleList);
    const { updated } = deleteSubscription(sampleList, sampleList[0]!.id);

    assert.strictEqual(updated.length, sampleList.length - 1);
    assert.deepStrictEqual(updated, [sampleList[1]]);
    assert.deepStrictEqual(sampleList, snapshot, "existing list must not be mutated");
  });

  it("should throw NOT_FOUND when id does not exist", () => {
    const snapshot = structuredClone(sampleList);

    assert.throws(
      () => deleteSubscription(sampleList, "00000000-0000-4000-8000-000000000999"),
      (err: unknown) => err instanceof AppError && err.code === "NOT_FOUND"
    );

    assert.deepStrictEqual(sampleList, snapshot);
  });
});

describe("Subscriptions: Property 5 — Eliminación verificable", () => {
  it("should ensure deleted subscription cannot be found by any subsequent lookup across 100+ iterations", () => {
    for (let iteration = 0; iteration < 120; iteration++) {
      let list: Subscription[] = [];
      const count = randomInt(1, 10);
      for (let i = 0; i < count; i++) {
        list = createSubscription(list, generateValidInput()).updated;
      }

      const targetIndex = randomInt(0, list.length - 1);
      const targetId = list[targetIndex]!.id;

      const { updated } = deleteSubscription(list, targetId);

      assert.strictEqual(updated.length, list.length - 1);
      assert.strictEqual(
        updated.some((sub) => sub.id === targetId),
        false
      );
      assert.throws(
        () => findById(updated, targetId),
        (err: unknown) => err instanceof AppError && err.code === "NOT_FOUND"
      );

      for (const remaining of updated) {
        assert.deepStrictEqual(findById(updated, remaining.id), remaining);
      }
    }
  });
});
