/**
 * @fileoverview Unit tests for domain input validators (REQ-1).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AppError } from "../../src/errors/AppError.js";
import {
  validateName,
  validateAmount,
  validateCurrency,
  validateStartDate,
  validateFrequency,
  validateStatus,
  validateCreateInput,
} from "../../src/domain/validation.js";

/**
 * Helper that asserts a function throws an `AppError` with the expected code
 * and optionally checks that the message contains a substring.
 */
function assertThrowsAppError(
  fn: () => void,
  expectedCode: AppError["code"],
  messageSubstring?: string
): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof AppError, `Expected AppError, got ${String(err)}`);
    assert.strictEqual(err.code, expectedCode);
    assert.ok(err.message.length > 0, "Error message must not be empty");
    if (messageSubstring !== undefined) {
      assert.ok(
        err.message.toLowerCase().includes(messageSubstring.toLowerCase()),
        `Expected message "${err.message}" to include "${messageSubstring}"`
      );
    }
    return true;
  });
}

describe("Validation: validateName", () => {
  it("should accept non-empty strings", () => {
    assert.doesNotThrow(() => validateName("Netflix"));
    assert.doesNotThrow(() => validateName("  Spotify Duo  "));
  });

  it("should reject empty or whitespace-only strings", () => {
    for (const invalid of ["", " ", "   ", "\t\n"]) {
      assertThrowsAppError(() => validateName(invalid), "VALIDATION_ERROR");
    }
  });

  it("should reject non-string values", () => {
    for (const invalid of [null, undefined, 123, {}, []]) {
      assertThrowsAppError(() => validateName(invalid), "VALIDATION_ERROR");
    }
  });
});

describe("Validation: validateAmount", () => {
  it("should accept positive finite numbers", () => {
    assert.doesNotThrow(() => validateAmount(0.01));
    assert.doesNotThrow(() => validateAmount(15.99));
    assert.doesNotThrow(() => validateAmount(1200));
  });

  it("should reject zero and negative numbers", () => {
    for (const invalid of [0, -0, -0.01, -100]) {
      assertThrowsAppError(() => validateAmount(invalid), "VALIDATION_ERROR");
    }
  });

  it("should reject non-finite numbers (NaN, Infinity, -Infinity)", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      assertThrowsAppError(() => validateAmount(invalid), "VALIDATION_ERROR");
    }
  });

  it("should reject non-number values", () => {
    for (const invalid of ["15.99", null, undefined, {}, true]) {
      assertThrowsAppError(() => validateAmount(invalid), "VALIDATION_ERROR");
    }
  });
});

describe("Validation: validateCurrency", () => {
  it("should accept non-empty currency strings", () => {
    assert.doesNotThrow(() => validateCurrency("EUR"));
    assert.doesNotThrow(() => validateCurrency("USD"));
    assert.doesNotThrow(() => validateCurrency("€"));
  });

  it("should reject empty, whitespace-only, or non-string values", () => {
    for (const invalid of ["", "   ", "\n", null, undefined, 42]) {
      assertThrowsAppError(() => validateCurrency(invalid), "VALIDATION_ERROR");
    }
  });
});

describe("Validation: validateStartDate", () => {
  it("should accept valid YYYY-MM-DD calendar dates including leap days", () => {
    assert.doesNotThrow(() => validateStartDate("2024-01-15"));
    assert.doesNotThrow(() => validateStartDate("2024-02-29"));
    assert.doesNotThrow(() => validateStartDate("2023-12-31"));
  });

  it("should reject invalid calendar dates with valid format", () => {
    for (const invalid of [
      "2024-02-30",
      "2023-02-29",
      "2024-04-31",
      "2024-13-01",
      "2024-00-10",
      "2024-01-00",
    ]) {
      assertThrowsAppError(() => validateStartDate(invalid), "VALIDATION_ERROR");
    }
  });

  it("should reject wrong date formats and non-string values", () => {
    for (const invalid of [
      "15-01-2024",
      "2024/01/15",
      "2024-1-5",
      "",
      "not-a-date",
      null,
      undefined,
      20240115,
    ]) {
      assertThrowsAppError(() => validateStartDate(invalid), "VALIDATION_ERROR");
    }
  });
});

describe("Validation: validateFrequency", () => {
  it("should accept mensual, trimestral and anual", () => {
    assert.doesNotThrow(() => validateFrequency("mensual"));
    assert.doesNotThrow(() => validateFrequency("trimestral"));
    assert.doesNotThrow(() => validateFrequency("anual"));
  });

  it("should reject unsupported frequencies and list allowed values", () => {
    for (const invalid of ["semanal", "diaria", "MENSUAL", "", null, undefined, 1]) {
      assertThrowsAppError(() => validateFrequency(invalid), "VALIDATION_ERROR", "mensual");
    }
  });
});

describe("Validation: validateStatus", () => {
  it("should accept activa and pausada", () => {
    assert.doesNotThrow(() => validateStatus("activa"));
    assert.doesNotThrow(() => validateStatus("pausada"));
  });

  it("should reject unsupported statuses and list allowed values", () => {
    for (const invalid of ["cancelada", "ACTIVA", "", null, undefined, false]) {
      assertThrowsAppError(() => validateStatus(invalid), "VALIDATION_ERROR", "activa");
    }
  });
});

describe("Validation: validateCreateInput", () => {
  const validInput = {
    name: "Netflix",
    amount: 15.99,
    currency: "EUR",
    startDate: "2024-01-15",
    frequency: "mensual",
    status: "activa",
  };

  it("should accept a complete valid input", () => {
    assert.doesNotThrow(() => validateCreateInput({ ...validInput }));
  });

  it("should reject non-object inputs", () => {
    for (const invalid of [null, undefined, "string", 123, []]) {
      assertThrowsAppError(() => validateCreateInput(invalid), "VALIDATION_ERROR");
    }
  });

  it("should identify each missing required field", () => {
    const requiredFields = [
      "name",
      "amount",
      "currency",
      "startDate",
      "frequency",
      "status",
    ] as const;

    for (const field of requiredFields) {
      const partial: Record<string, unknown> = { ...validInput };
      delete partial[field];
      assertThrowsAppError(
        () => validateCreateInput(partial),
        "VALIDATION_ERROR",
        field
      );
    }
  });
});
