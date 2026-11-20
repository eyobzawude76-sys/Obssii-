import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import mongoose from "mongoose";
import { ensureV1IntegrityIndexes } from "./ensure-v1-integrity-indexes.mjs";

nextEnv.loadEnvConfig(process.cwd());

function localMongoUri() {
  const raw = process.env.MONGODB_URI;
  assert.ok(raw, "MONGODB_URI is required for the disposable index test");
  const parsed = new URL(raw);
  assert.ok(
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname),
    "The index integration test only connects to a local MongoDB server",
  );
  return raw;
}

test("integrity indexes reject duplicate attempts and question sets", async () => {
  const uri = localMongoUri();
  const databaseName = `oes_v1_disposable_${crypto.randomUUID().replaceAll("-", "")}`;
  const ownedResultIds = [
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
  ];
  const concurrentResultId = new mongoose.Types.ObjectId();
  const ownedQuestionIds = [
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
  ];
  let connected = false;

  try {
    await mongoose.connect(uri, { dbName: databaseName, autoIndex: false });
    connected = true;
    const db = mongoose.connection.db;
    assert.equal((await db.listCollections().toArray()).length, 0);

    const student = new mongoose.Types.ObjectId();
    const exam = new mongoose.Types.ObjectId();
    await db.collection("results").insertMany([
      { _id: ownedResultIds[0], student, test: exam, testCompleted: false },
      { _id: ownedResultIds[1], student, test: exam, testCompleted: false },
    ]);
    await assert.rejects(
      ensureV1IntegrityIndexes(db),
      /duplicate active-attempt groups/,
    );

    const removedDuplicate = await db
      .collection("results")
      .deleteOne({ _id: ownedResultIds[1] });
    assert.equal(removedDuplicate.deletedCount, 1);
    const created = await ensureV1IntegrityIndexes(db);
    assert.deepEqual(created.sort(), [
      "uniq_active_attempt_per_student_test",
      "uniq_question_set_per_test",
    ]);

    const concurrentStudent = new mongoose.Types.ObjectId();
    const concurrentExam = new mongoose.Types.ObjectId();
    const concurrent = await Promise.allSettled([
      db.collection("results").insertOne({
        _id: ownedResultIds[1],
        student: concurrentStudent,
        test: concurrentExam,
        testCompleted: false,
      }),
      db.collection("results").insertOne({
        _id: concurrentResultId,
        student: concurrentStudent,
        test: concurrentExam,
        testCompleted: false,
      }),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      concurrent.filter(
        (result) =>
          result.status === "rejected" && result.reason?.code === 11000,
      ).length,
      1,
    );

    const testId = new mongoose.Types.ObjectId();
    await db.collection("questions").insertOne({
      _id: ownedQuestionIds[0],
      testId,
    });
    await assert.rejects(
      db.collection("questions").insertOne({
        _id: ownedQuestionIds[1],
        testId,
      }),
      (error) => error?.code === 11000,
    );
  } finally {
    if (connected) {
      const db = mongoose.connection.db;
      await db.collection("results").deleteMany({
        _id: { $in: [...ownedResultIds, concurrentResultId] },
      });
      await db
        .collection("questions")
        .deleteMany({ _id: { $in: ownedQuestionIds } });
      assert.equal(await db.collection("results").countDocuments(), 0);
      assert.equal(await db.collection("questions").countDocuments(), 0);
      assert.ok(databaseName.startsWith("oes_v1_disposable_"));
      await db.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
