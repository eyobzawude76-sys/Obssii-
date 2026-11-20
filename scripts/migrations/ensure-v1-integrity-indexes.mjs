import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import mongoose from "mongoose";

const { loadEnvConfig } = nextEnv;

export const V1_INTEGRITY_INDEXES = [
  {
    collection: "results",
    key: { student: 1, test: 1 },
    options: {
      unique: true,
      partialFilterExpression: { testCompleted: false },
      name: "uniq_active_attempt_per_student_test",
    },
  },
  {
    collection: "questions",
    key: { testId: 1 },
    options: { unique: true, name: "uniq_question_set_per_test" },
  },
];

export async function findIndexConflicts(db) {
  const [activeAttempts, questionSets] = await Promise.all([
    db
      .collection("results")
      .aggregate([
        { $match: { testCompleted: false } },
        {
          $group: {
            _id: { student: "$student", test: "$test" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 10 },
      ])
      .toArray(),
    db
      .collection("questions")
      .aggregate([
        { $group: { _id: "$testId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 10 },
      ])
      .toArray(),
  ]);
  return { activeAttempts, questionSets };
}

export async function ensureV1IntegrityIndexes(db) {
  const conflicts = await findIndexConflicts(db);
  if (conflicts.activeAttempts.length || conflicts.questionSets.length) {
    throw new Error(
      `Index migration refused: ${conflicts.activeAttempts.length} duplicate active-attempt groups and ${conflicts.questionSets.length} duplicate question-set groups require review. No records were changed.`,
    );
  }

  for (const index of V1_INTEGRITY_INDEXES) {
    await db.collection(index.collection).createIndex(index.key, index.options);
  }

  return Promise.all(
    V1_INTEGRITY_INDEXES.map(async (index) => {
      const found = (await db.collection(index.collection).indexes()).find(
        (candidate) => candidate.name === index.options.name,
      );
      if (!found || !found.unique) {
        throw new Error(`Index verification failed: ${index.options.name}`);
      }
      return found.name;
    }),
  );
}

function getLocalDatabaseTarget(args, env) {
  const rawUri = env.MONGODB_URI;
  if (!rawUri) throw new Error("MONGODB_URI is required");
  const uri = new URL(rawUri);
  if (!["127.0.0.1", "localhost", "::1"].includes(uri.hostname)) {
    throw new Error("Refusing to connect to a non-local MongoDB host");
  }

  const target = args.find((arg) => arg.startsWith("--database="))?.slice(11);
  if (!target) throw new Error("Pass an explicit --database=<name>");
  const configured = decodeURIComponent(uri.pathname.replace(/^\//, ""));
  if (target !== configured && !target.startsWith("oes_v1_disposable_")) {
    throw new Error(
      "The target must match MONGODB_URI or use the oes_v1_disposable_ prefix",
    );
  }
  return { uri: rawUri, databaseName: target };
}

async function runCli() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const { uri, databaseName } = getLocalDatabaseTarget(args, process.env);
  await mongoose.connect(uri, { dbName: databaseName, autoIndex: false });
  try {
    const conflicts = await findIndexConflicts(mongoose.connection.db);
    if (conflicts.activeAttempts.length || conflicts.questionSets.length) {
      throw new Error(
        `Preflight found ${conflicts.activeAttempts.length} duplicate active-attempt groups and ${conflicts.questionSets.length} duplicate question-set groups. No indexes were changed.`,
      );
    }

    if (!args.includes("--apply")) {
      console.log(
        JSON.stringify({
          database: databaseName,
          mode: "dry-run",
          conflicts: 0,
          indexes: V1_INTEGRITY_INDEXES.map((index) => index.options.name),
        }),
      );
      return;
    }

    const indexes = await ensureV1IntegrityIndexes(mongoose.connection.db);
    console.log(
      JSON.stringify({ database: databaseName, mode: "applied", indexes }),
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
