/**
 * @fileoverview Pure CRUD operations over in-memory subscription lists.
 */

import { randomUUID } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import type {
  CreateSubscriptionInput,
  Subscription,
  UpdateSubscriptionInput,
} from "./types.js";
import { validateCreateInput, validateUpdateInput } from "./validation.js";

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

/**
 * Partially updates an existing subscription identified by `id`.
 *
 * Operates atomically: validates all provided fields before constructing the
 * updated list, leaving `existing` untouched if any validation fails.
 *
 * @param existing - Current list of subscriptions in the store.
 * @param id - Unique identifier of the subscription to update.
 * @param input - Partial update payload (excluding `id`).
 * @returns An object with the `updated` subscription list and the updated `subscription`.
 * @throws {AppError} With code `NOT_FOUND` if no subscription matches `id`.
 * @throws {AppError} With code `FORBIDDEN_FIELD` if `input` attempts to modify `id`.
 * @throws {AppError} With code `VALIDATION_ERROR` if any provided field is invalid.
 */
export function updateSubscription(
  existing: Subscription[],
  id: string,
  input: UpdateSubscriptionInput
): { updated: Subscription[]; subscription: Subscription } {
  const index = existing.findIndex((sub) => sub.id === id);
  if (index === -1) {
    throw new AppError(
      "NOT_FOUND",
      `No se encontró ninguna suscripción con id "${id}".`,
      { id }
    );
  }

  validateUpdateInput(input);

  const current = existing[index]!;
  const subscription: Subscription = {
    id: current.id,
    name: input.name !== undefined ? input.name.trim() : current.name,
    amount: input.amount !== undefined ? input.amount : current.amount,
    currency:
      input.currency !== undefined ? input.currency.trim() : current.currency,
    startDate:
      input.startDate !== undefined ? input.startDate : current.startDate,
    frequency:
      input.frequency !== undefined ? input.frequency : current.frequency,
    status: input.status !== undefined ? input.status : current.status,
  };

  const updated = existing.map((sub, i) => (i === index ? subscription : sub));

  return { updated, subscription };
}

/**
 * Finds a subscription by its unique `id`.
 *
 * @param existing - Current list of subscriptions in the store.
 * @param id - Unique identifier of the subscription to retrieve.
 * @returns The matching {@link Subscription}.
 * @throws {AppError} With code `NOT_FOUND` if no subscription matches `id`.
 */
export function findById(existing: Subscription[], id: string): Subscription {
  const found = existing.find((sub) => sub.id === id);
  if (!found) {
    throw new AppError(
      "NOT_FOUND",
      `No se encontró ninguna suscripción con id "${id}".`,
      { id }
    );
  }
  return found;
}

/**
 * Deletes the subscription with the given `id` from the list.
 *
 * Does not mutate `existing`; returns a new array without the removed item.
 *
 * @param existing - Current list of subscriptions in the store.
 * @param id - Unique identifier of the subscription to delete.
 * @returns An object with the `updated` subscription list.
 * @throws {AppError} With code `NOT_FOUND` if no subscription matches `id`.
 */
export function deleteSubscription(
  existing: Subscription[],
  id: string
): { updated: Subscription[] } {
  findById(existing, id);
  const updated = existing.filter((sub) => sub.id !== id);
  return { updated };
}
