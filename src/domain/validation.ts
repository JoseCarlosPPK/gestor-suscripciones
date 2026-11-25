/**
 * @fileoverview Pure validation functions for subscription domain inputs.
 *
 * Every validator throws a typed {@link AppError} with code `"VALIDATION_ERROR"`
 * when a constraint is violated.
 */

import { AppError } from "../errors/AppError.js";
import type {
  CreateSubscriptionInput,
  Frequency,
  SubscriptionStatus,
  UpdateSubscriptionInput,
} from "./types.js";

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_FREQUENCIES: readonly Frequency[] = ["mensual", "trimestral", "anual"];
const ALLOWED_STATUSES: readonly SubscriptionStatus[] = ["activa", "pausada"];
const REQUIRED_CREATE_FIELDS: readonly (keyof CreateSubscriptionInput)[] = [
  "name",
  "amount",
  "currency",
  "startDate",
  "frequency",
  "status",
];

/**
 * Validates that a subscription name is a non-empty string after trimming.
 *
 * @param value - Value to validate.
 * @throws {AppError} With code `VALIDATION_ERROR` if invalid.
 */
export function validateName(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length < 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El nombre de la suscripción no puede estar vacío.",
      { field: "name", received: value }
    );
  }
}

/**
 * Validates that a subscription amount is a strictly positive finite number.
 *
 * @param value - Value to validate.
 * @throws {AppError} With code `VALIDATION_ERROR` if invalid.
 */
export function validateAmount(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El importe debe ser un número positivo finito.",
      { field: "amount", received: value }
    );
  }
}

/**
 * Validates that a currency code or symbol is a non-empty string after trimming.
 *
 * @param value - Value to validate.
 * @throws {AppError} With code `VALIDATION_ERROR` if invalid.
 */
export function validateCurrency(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length < 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La moneda no puede estar vacía.",
      { field: "currency", received: value }
    );
  }
}

/**
 * Validates that a start date uses `YYYY-MM-DD` format and represents a valid calendar date.
 *
 * @param value - Value to validate.
 * @throws {AppError} With code `VALIDATION_ERROR` if invalid.
 */
export function validateStartDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !DATE_FORMAT_REGEX.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La fecha de inicio debe seguir el formato YYYY-MM-DD.",
      { field: "startDate", received: value }
    );
  }

  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isValidCalendarDate) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La fecha de inicio debe tener el formato YYYY-MM-DD y ser una fecha de calendario válida.",
      { field: "startDate", received: value }
    );
  }
}

/**
 * Validates that a billing frequency is one of `"mensual"`, `"trimestral"`, or `"anual"`.
 *
 * @param value - Value to validate.
 * @throws {AppError} With code `VALIDATION_ERROR` if invalid.
 */
export function validateFrequency(value: unknown): asserts value is Frequency {
  if (
    typeof value !== "string" ||
    !ALLOWED_FREQUENCIES.includes(value as Frequency)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `La frecuencia debe ser uno de los valores permitidos: ${ALLOWED_FREQUENCIES.join(", ")}.`,
      { field: "frequency", received: value }
    );
  }
}

/**
 * Validates that a subscription status is either `"activa"` or `"pausada"`.
 *
 * @param value - Value to validate.
 * @throws {AppError} With code `VALIDATION_ERROR` if invalid.
 */
export function validateStatus(value: unknown): asserts value is SubscriptionStatus {
  if (
    typeof value !== "string" ||
    !ALLOWED_STATUSES.includes(value as SubscriptionStatus)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `El estado debe ser uno de los valores permitidos: ${ALLOWED_STATUSES.join(", ")}.`,
      { field: "status", received: value }
    );
  }
}

/**
 * Validates a complete subscription creation payload, ensuring all required
 * fields are present and satisfy their domain constraints.
 *
 * @param input - Unknown payload to validate.
 * @throws {AppError} With code `VALIDATION_ERROR` on the first missing or invalid field.
 */
export function validateCreateInput(
  input: unknown
): asserts input is CreateSubscriptionInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La entrada debe ser un objeto con los datos de la suscripción.",
      { received: input }
    );
  }

  const record = input as Record<string, unknown>;

  for (const field of REQUIRED_CREATE_FIELDS) {
    if (
      !Object.prototype.hasOwnProperty.call(record, field) ||
      record[field] === undefined
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Falta el campo obligatorio: ${field}.`,
        { field }
      );
    }
  }

  validateName(record.name);
  validateAmount(record.amount);
  validateCurrency(record.currency);
  validateStartDate(record.startDate);
  validateFrequency(record.frequency);
  validateStatus(record.status);
}

/**
 * Validates a partial subscription update payload.
 *
 * Only fields present in the payload (with non-`undefined` values) are validated.
 * Rejects any attempt to include the immutable `id` field with `FORBIDDEN_FIELD`.
 *
 * @param input - Unknown partial update payload to validate.
 * @throws {AppError} With code `FORBIDDEN_FIELD` if `id` is present in `input`.
 * @throws {AppError} With code `VALIDATION_ERROR` if `input` is not an object or any present field is invalid.
 */
export function validateUpdateInput(
  input: unknown
): asserts input is UpdateSubscriptionInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La entrada de actualización debe ser un objeto.",
      { received: input }
    );
  }

  const record = input as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(record, "id")) {
    throw new AppError(
      "FORBIDDEN_FIELD",
      "El campo 'id' es inmutable y no puede modificarse.",
      { field: "id" }
    );
  }

  if (record.name !== undefined) validateName(record.name);
  if (record.amount !== undefined) validateAmount(record.amount);
  if (record.currency !== undefined) validateCurrency(record.currency);
  if (record.startDate !== undefined) validateStartDate(record.startDate);
  if (record.frequency !== undefined) validateFrequency(record.frequency);
  if (record.status !== undefined) validateStatus(record.status);
}
