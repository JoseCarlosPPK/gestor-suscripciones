/**
 * @fileoverview Pure spending calculations for active subscriptions.
 *
 * Monthly cost is normalized by billing frequency. Annual projection is
 * always twelve times that monthly total. Paused subscriptions are ignored.
 */

import type { Frequency, SpendingSummary, Subscription } from "./types.js";

/**
 * Divisor applied to a subscription amount to express it as a monthly cost.
 * - `"mensual"`: 1
 * - `"trimestral"`: 3
 * - `"anual"`: 12
 */
const FREQUENCY_FACTOR: Record<Frequency, number> = {
  mensual: 1,
  trimestral: 3,
  anual: 12,
};

/**
 * Calculates the normalized monthly spending of active subscriptions.
 *
 * Each active subscription contributes `amount / FREQUENCY_FACTOR[frequency]`.
 * Paused subscriptions are excluded. An empty list, or a list with no active
 * subscriptions, yields `0`.
 *
 * @param subscriptions - Subscriptions to aggregate. The array is not mutated.
 * @returns The sum of normalized monthly amounts for subscriptions with status `"activa"`.
 */
export function computeMonthlyNormalized(subscriptions: Subscription[]): number {
  return subscriptions.reduce((total, subscription) => {
    if (subscription.status !== "activa") {
      return total;
    }
    return total + subscription.amount / FREQUENCY_FACTOR[subscription.frequency];
  }, 0);
}

/**
 * Calculates the projected annual spending from the normalized monthly total.
 *
 * @param subscriptions - Subscriptions to aggregate. The array is not mutated.
 * @returns `computeMonthlyNormalized(subscriptions) * 12`.
 */
export function computeAnnualProjected(subscriptions: Subscription[]): number {
  return computeMonthlyNormalized(subscriptions) * 12;
}

/**
 * Returns both normalized monthly spending and the annual projection.
 *
 * @param subscriptions - Subscriptions to aggregate. The array is not mutated.
 * @returns A summary whose `annualProjected` value is exactly `monthlyNormalized * 12`.
 */
export function computeSpendingSummary(subscriptions: Subscription[]): SpendingSummary {
  const monthlyNormalized = computeMonthlyNormalized(subscriptions);
  return {
    monthlyNormalized,
    annualProjected: monthlyNormalized * 12,
  };
}
