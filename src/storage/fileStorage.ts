/**
 * @fileoverview Atomic JSON file persistence for subscriptions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors/AppError.js";
import type { Subscription } from "../domain/types.js";

/**
 * Writes the subscription list to `filePath` formatted with 2-space indentation.
 *
 * Uses an atomic write pattern: writes to `<filePath>.tmp` first and then
 * renames it over `filePath` so the target file is never left partially written.
 * Best-effort cleanup of the temporary file is attempted if any step fails.
 *
 * @param filePath - Destination path for the JSON data store.
 * @param subscriptions - Subscription list to persist.
 * @throws {AppError} With code `IO_WRITE_ERROR` if any filesystem operation fails.
 */
export async function writeSubscriptions(
  filePath: string,
  subscriptions: Subscription[]
): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(subscriptions, null, 2)}\n`;

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tempPath, payload, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (err: unknown) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw new AppError(
      "IO_WRITE_ERROR",
      "No se pudo escribir el archivo de suscripciones.",
      err
    );
  }
}
