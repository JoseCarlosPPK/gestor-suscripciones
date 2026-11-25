/**
 * @fileoverview Smoke tests for the test runner and core domain modules.
 *
 * These tests verify that:
 * 1. The test runner (node --test) is correctly configured.
 * 2. `AppError` can be instantiated and thrown as a proper Error subclass.
 * 3. Domain type shapes can be constructed without TypeScript compile errors.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import from the compiled source tree (relative paths from dist-tests/)
import { AppError } from "../../src/errors/AppError.js";
import type { Subscription, SpendingSummary, AlertWindow, ExportResult } from "../../src/domain/types.js";

describe("Smoke: test runner", () => {
  it("should execute at least one assertion", () => {
    assert.ok(true, "El runner de tests funciona correctamente");
  });
});

describe("Smoke: AppError", () => {
  it("should be an instance of Error", () => {
    const err = new AppError("VALIDATION_ERROR", "El importe debe ser mayor que 0.");
    assert.ok(err instanceof Error, "AppError debe ser instancia de Error");
    assert.ok(err instanceof AppError, "AppError debe ser instancia de AppError");
  });

  it("should expose the correct code and message", () => {
    const err = new AppError("NOT_FOUND", "Suscripción no encontrada.", { id: "abc" });
    assert.strictEqual(err.code, "NOT_FOUND");
    assert.strictEqual(err.message, "Suscripción no encontrada.");
    assert.deepStrictEqual(err.context, { id: "abc" });
  });

  it("should have name set to 'AppError'", () => {
    const err = new AppError("IO_READ_ERROR", "Error al leer el archivo.");
    assert.strictEqual(err.name, "AppError");
  });

  it("should be throwable and catchable", () => {
    assert.throws(
      () => { throw new AppError("VALIDATION_ERROR", "Nombre vacío."); },
      (thrown: unknown) => {
        assert.ok(thrown instanceof AppError);
        assert.strictEqual((thrown as AppError).code, "VALIDATION_ERROR");
        return true;
      }
    );
  });
});

describe("Smoke: domain type shapes", () => {
  it("should allow constructing a valid Subscription object", () => {
    const sub: Subscription = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Netflix",
      amount: 12.99,
      currency: "EUR",
      startDate: "2024-01-01",
      frequency: "mensual",
      status: "activa",
    };
    assert.strictEqual(sub.name, "Netflix");
    assert.strictEqual(sub.frequency, "mensual");
    assert.strictEqual(sub.status, "activa");
  });

  it("should allow constructing a SpendingSummary", () => {
    const summary: SpendingSummary = { monthlyNormalized: 15.5, annualProjected: 186 };
    assert.strictEqual(summary.annualProjected, summary.monthlyNormalized * 12);
  });

  it("should allow constructing an AlertWindow", () => {
    const window: AlertWindow = {
      referenceDate: "2024-06-01",
      horizonDays: 7,
      subscriptions: [],
    };
    assert.strictEqual(window.horizonDays, 7);
    assert.deepStrictEqual(window.subscriptions, []);
  });

  it("should allow constructing an ExportResult", () => {
    const result: ExportResult = { format: "json", content: "{}" };
    assert.strictEqual(result.format, "json");
  });
});
