/**
 * @fileoverview Pure CRUD operations over in-memory subscription lists.
 */

import { randomUUID } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import type { CreateSubscriptionInput, Subscription } from "./types.js";
import { validateCreateInput } from "./validation.js";

/**
 * Creates a new subscription, validates the input, and generates a unique UUID v4 `id`.
 *
 * Does not mutate the `existing` array; returns a new array containing all
 * existing subscriptions plus the newly created one.
 *
 * @param existing - Current list of subscriptions in the store.
 * @param input - Validated creation fields without `id`.
 * @returns An object with the `updated` subscription list and the `created` subscription.
 * @throws {AppError} With code `VALIDATION_ERROR` if input validation fails.
 * @throws {AppError} With code `DUPLICATE_ID` if the generated id collides with an existing one.
 */
export function createSubscription(
  existing: Subscription[],
  input: CreateSubscriptionInput
): { updated: Subscription[]; created: Subscription } {
  validateCreateInput(input);

  const id = randomUUID();

  if (existing.some((sub) => sub.id === id)) {
    throw new AppError(
      "DUPLICATE_ID",
      "El identificador generado ya existe en el almacén de datos.",
      { id }
    );
  }

  const created: Subscription = {
    id,
    name: input.name.trim(),
    amount: input.amount,
    currency: input.currency.trim(),
    startDate: input.startDate,
    frequency: input.frequency,
    status: input.status,
  };

  return {
    updated: [...existing, created],
    created,
  };
}
