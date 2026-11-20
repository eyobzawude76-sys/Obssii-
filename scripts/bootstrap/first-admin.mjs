import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import nextEnv from "@next/env";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import ts from "typescript";

const EXPECTED_URI = "mongodb://127.0.0.1:27017/online-examination-system";
const LOCK_COLLECTION = "_smartExamFirstAdminBootstrap";
const LOCK_ID = "first-admin-v1";
const LOCAL_APP_ORIGIN = "http://127.0.0.1:3000";
const root = process.cwd();
nextEnv.loadEnvConfig(root);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readCredentials() {
  const credentials = {
    name: process.env.SMARTEXAM_BOOTSTRAP_ADMIN_NAME?.trim(),
    email: process.env.SMARTEXAM_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),
    username:
      process.env.SMARTEXAM_BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase(),
    password: process.env.SMARTEXAM_BOOTSTRAP_ADMIN_PASSWORD,
  };
  if (Object.values(credentials).some((value) => !value)) {
    throw new Error(
      "Set SMARTEXAM_BOOTSTRAP_ADMIN_NAME, SMARTEXAM_BOOTSTRAP_ADMIN_EMAIL, SMARTEXAM_BOOTSTRAP_ADMIN_USERNAME, and SMARTEXAM_BOOTSTRAP_ADMIN_PASSWORD in the local process environment.",
    );
  }
  if (credentials.name.length < 2 || credentials.name.length > 100) {
    throw new Error("Admin name must be 2 to 100 characters.");
  }
  if (
    credentials.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)
  ) {
    throw new Error("Admin email address is invalid.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(credentials.username)) {
    throw new Error(
      "Admin username must be 3 to 64 lowercase letters, digits, dots, underscores, or hyphens.",
    );
  }
  const passwordBytes = Buffer.byteLength(credentials.password, "utf8");
  if (passwordBytes < 12 || passwordBytes > 72) {
    throw new Error("Admin password must be 12 to 72 UTF-8 bytes for bcrypt.");
  }
  return credentials;
}

async function verifyLocalAppReady() {
  let loginPage;
  let anonymousSession;
  try {
    [loginPage, anonymousSession] = await Promise.all([
      fetch(`${LOCAL_APP_ORIGIN}/login`),
      fetch(`${LOCAL_APP_ORIGIN}/api/auth/me`),
    ]);
  } catch {
    throw new Error(
      "Refusing bootstrap: local app must be running at 127.0.0.1:3000.",
    );
  }
  if (!loginPage.ok || !anonymousSession.ok) {
    throw new Error("Refusing bootstrap: local app readiness checks failed.");
  }
  const body = await anonymousSession.json().catch(() => null);
  if (body?.user !== null) {
    throw new Error(
      "Refusing bootstrap: expected an unauthenticated local session.",
    );
  }
}

async function verifyAdminLogin(credentials) {
  let response;
  try {
    response = await fetch(`${LOCAL_APP_ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: credentials.username,
        password: credentials.password,
      }),
    });
  } catch {
    throw new Error(
      "Admin account was created, but local login verification could not connect.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Admin account was created, but login verification returned HTTP ${response.status}.`,
    );
  }
  const loginBody = await response.json().catch(() => null);
  const cookies = response.headers.getSetCookie?.() || [];
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  if (loginBody?.role !== "admin" || !cookie) {
    throw new Error(
      "Admin account was created, but login did not verify the ADMIN role/session.",
    );
  }
  const me = await fetch(`${LOCAL_APP_ORIGIN}/api/auth/me`, {
    headers: { cookie },
  }).catch(() => null);
  if (!me?.ok) {
    throw new Error(
      "Admin account was created, but /api/auth/me verification failed.",
    );
  }
  const meBody = await me.json().catch(() => null);
  if (meBody?.user?.role !== "admin") {
    throw new Error(
      "Admin account was created, but /api/auth/me did not return ADMIN.",
    );
  }
}

async function main() {
  if (process.env.MONGODB_URI !== EXPECTED_URI) {
    throw new Error(
      "Refusing bootstrap: MONGODB_URI must exactly match the approved local URI.",
    );
  }
  const uri = new URL(process.env.MONGODB_URI);
  if (
    uri.protocol !== "mongodb:" ||
    uri.hostname !== "127.0.0.1" ||
    uri.port !== "27017" ||
    decodeURIComponent(uri.pathname.replace(/^\//, "")) !==
      "online-examination-system"
  ) {
    throw new Error(
      "Refusing bootstrap: local host, port, or database verification failed.",
    );
  }

  // Only the User model is needed. Compile the existing model without changing it.
  const require = createRequire(import.meta.url);
  require.extensions[".ts"] = (module, filename) => {
    const source = require("node:fs").readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;
    module._compile(compiled, filename);
  };
  const loadedUser = require(path.join(root, "src", "models", "User.ts"));
  const User = loadedUser.default || loadedUser;

  const credentials = readCredentials();
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  if (!Number.isInteger(saltRounds) || saltRounds < 10 || saltRounds > 15) {
    throw new Error("BCRYPT_SALT_ROUNDS must be an integer from 10 to 15.");
  }
  await verifyLocalAppReady();

  await mongoose.connect(EXPECTED_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 5000,
  });
  const db = mongoose.connection.db;
  if (db.databaseName !== "online-examination-system") {
    throw new Error(
      "Refusing bootstrap: connected database name did not match.",
    );
  }

  let lockAcquired = false;
  let adminCreated = false;
  const runId = randomUUID();
  try {
    const existingUsers = await User.countDocuments({});
    if (existingUsers !== 0) {
      throw new Error(
        "First-admin bootstrap refused: the users collection is not empty.",
      );
    }
    const existingLockCollection = await db
      .listCollections({ name: LOCK_COLLECTION }, { nameOnly: true })
      .hasNext();
    if (existingLockCollection) {
      throw new Error(
        "First-admin bootstrap refused: a previous bootstrap lock requires manual review.",
      );
    }
    await db.createCollection(LOCK_COLLECTION);
    await db.collection(LOCK_COLLECTION).insertOne({
      _id: LOCK_ID,
      runId,
      createdAt: new Date(),
    });
    lockAcquired = true;

    if ((await User.countDocuments({})) !== 0) {
      throw new Error(
        "First-admin bootstrap refused: a user appeared during setup.",
      );
    }
    const user = new User({
      name: credentials.name,
      email: credentials.email,
      username: credentials.username,
      password: await bcrypt.hash(credentials.password, saltRounds),
      role: "admin",
      isActive: true,
      dateJoined: new Date(),
    });
    await user.validate();
    await user.save();
    adminCreated = true;

    const verified = await User.findById(user._id)
      .select("role isActive")
      .lean();
    if (!verified || verified.role !== "admin" || verified.isActive !== true) {
      throw new Error(
        "Created account did not pass role and active-state verification.",
      );
    }
    await verifyAdminLogin(credentials);
    await db.collection(LOCK_COLLECTION).deleteOne({ _id: LOCK_ID, runId });
    await db.dropCollection(LOCK_COLLECTION);
    lockAcquired = false;
    console.log(
      `Created first ADMIN account and verified login and /api/auth/me role. Account ID: ${String(user._id)}`,
    );
  } finally {
    if (lockAcquired && !adminCreated) {
      const remainingUsers = await User.countDocuments({}).catch(() => 1);
      if (remainingUsers === 0) {
        await db
          .collection(LOCK_COLLECTION)
          .deleteOne({ _id: LOCK_ID, runId })
          .catch(() => undefined);
        await db.dropCollection(LOCK_COLLECTION).catch(() => undefined);
      }
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  const message =
    typeof error?.message === "string" ? error.message : "Unexpected error";
  const safeMessages = new Set([
    "Set SMARTEXAM_BOOTSTRAP_ADMIN_NAME, SMARTEXAM_BOOTSTRAP_ADMIN_EMAIL, SMARTEXAM_BOOTSTRAP_ADMIN_USERNAME, and SMARTEXAM_BOOTSTRAP_ADMIN_PASSWORD in the local process environment.",
    "Admin name must be 2 to 100 characters.",
    "Admin email address is invalid.",
    "Admin username must be 3 to 64 lowercase letters, digits, dots, underscores, or hyphens.",
    "Admin password must be 12 to 72 UTF-8 bytes for bcrypt.",
    "BCRYPT_SALT_ROUNDS must be an integer from 10 to 15.",
    "Refusing bootstrap: MONGODB_URI must exactly match the approved local URI.",
    "Refusing bootstrap: local host, port, or database verification failed.",
  ]);
  if (
    safeMessages.has(message) ||
    message.startsWith("Refusing bootstrap:") ||
    message.startsWith("First-admin bootstrap refused:") ||
    message.startsWith(
      "Admin account was created, but login verification returned HTTP ",
    )
  ) {
    fail(message);
  } else {
    fail("Bootstrap failed; credential values were not logged.");
  }
});
