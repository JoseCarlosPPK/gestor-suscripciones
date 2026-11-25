/**
 * @fileoverview Unit tests for atomic file persistence using node:fs/promises mocks.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { AppError } from "../../src/errors/AppError.js";
import type { Subscription } from "../../src/domain/types.js";
import { writeSubscriptions } from "../../src/storage/fileStorage.js";

const SAMPLE_SUBSCRIPTIONS: Subscription[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Netflix",
    amount: 15.99,
    currency: "EUR",
    startDate: "2024-01-15",
    frequency: "mensual",
    status: "activa",
  },
];

describe("Storage: writeSubscriptions", () => {
  it("should write 2-space indented JSON to a temp file and atomically rename it", async (t) => {
    const mkdirMock = t.mock.method(fs, "mkdir", async () => undefined);
    const writeFileMock = t.mock.method(fs, "writeFile", async () => undefined);
    const renameMock = t.mock.method(fs, "rename", async () => undefined);

    const targetPath = "/tmp/test-data/subscriptions.json";
    await writeSubscriptions(targetPath, SAMPLE_SUBSCRIPTIONS);

    assert.strictEqual(mkdirMock.mock.callCount(), 1);
    assert.deepStrictEqual(mkdirMock.mock.calls[0]?.arguments, [
      "/tmp/test-data",
      { recursive: true },
    ]);

    assert.strictEqual(writeFileMock.mock.callCount(), 1);
    const [writtenPath, writtenContent, writtenEncoding] =
      writeFileMock.mock.calls[0]!.arguments;
    assert.strictEqual(writtenPath, `${targetPath}.tmp`);
    assert.strictEqual(writtenEncoding, "utf8");
    assert.strictEqual(
      writtenContent,
      `${JSON.stringify(SAMPLE_SUBSCRIPTIONS, null, 2)}\n`
    );

    assert.strictEqual(renameMock.mock.callCount(), 1);
    assert.deepStrictEqual(renameMock.mock.calls[0]?.arguments, [
      `${targetPath}.tmp`,
      targetPath,
    ]);
  });

  it("should clean up temp file and throw IO_WRITE_ERROR when writeFile fails", async (t) => {
    const diskError = new Error("ENOSPC: no space left on device");
    t.mock.method(fs, "mkdir", async () => undefined);
    t.mock.method(fs, "writeFile", async () => {
      throw diskError;
    });
    const renameMock = t.mock.method(fs, "rename", async () => undefined);
    const unlinkMock = t.mock.method(fs, "unlink", async () => undefined);

    const targetPath = "/tmp/test-data/subscriptions.json";

    await assert.rejects(
      () => writeSubscriptions(targetPath, SAMPLE_SUBSCRIPTIONS),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.code, "IO_WRITE_ERROR");
        assert.strictEqual(err.context, diskError);
        return true;
      }
    );

    assert.strictEqual(renameMock.mock.callCount(), 0);
    assert.strictEqual(unlinkMock.mock.callCount(), 1);
    assert.deepStrictEqual(unlinkMock.mock.calls[0]?.arguments, [`${targetPath}.tmp`]);
  });

  it("should clean up temp file and throw IO_WRITE_ERROR when rename fails", async (t) => {
    const renameError = new Error("EACCES: permission denied");
    t.mock.method(fs, "mkdir", async () => undefined);
    t.mock.method(fs, "writeFile", async () => undefined);
    t.mock.method(fs, "rename", async () => {
      throw renameError;
    });
    const unlinkMock = t.mock.method(fs, "unlink", async () => undefined);

    const targetPath = "/tmp/test-data/subscriptions.json";

    await assert.rejects(
      () => writeSubscriptions(targetPath, SAMPLE_SUBSCRIPTIONS),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.code, "IO_WRITE_ERROR");
        assert.strictEqual(err.context, renameError);
        return true;
      }
    );

    assert.strictEqual(unlinkMock.mock.callCount(), 1);
    assert.deepStrictEqual(unlinkMock.mock.calls[0]?.arguments, [`${targetPath}.tmp`]);
  });
});
