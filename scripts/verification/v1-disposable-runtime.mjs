import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import bcrypt from "bcrypt";
import mongoose from "mongoose";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
nextEnv.loadEnvConfig(root);
const sourceUri = process.env.MONGODB_URI;
if (!sourceUri)
  throw new Error("MONGODB_URI is required for local verification");
const uri = new URL(sourceUri);
if (
  !["mongodb:", "mongodb+srv:"].includes(uri.protocol) ||
  !["127.0.0.1", "localhost", "::1"].includes(uri.hostname)
) {
  throw new Error(
    "Refusing runtime test: configured MongoDB host is not loopback",
  );
}
if (uri.protocol === "mongodb+srv:") {
  throw new Error("Refusing runtime test: SRV database URIs are not allowed");
}

const dbName = `oes_v1_disposable_${randomUUID().replaceAll("-", "")}`;
uri.pathname = `/${dbName}`;
const testUri = uri.toString();
const runId = randomUUID();
const adminEmail = `superadmin-${runId}@example.invalid`;
const adminPassword = randomBytes(24).toString("base64url");
const randomSecret = () => randomBytes(48).toString("base64url");
const expectedStatus = async (response, status, label) => {
  if (response.status !== status) {
    const detail = await response.text();
    throw new Error(
      `${label}: expected ${status}, received ${response.status}: ${detail.slice(0, 500)}`,
    );
  }
  return response;
};
let child;
let mongoConnected = false;
let base;
const cookies = new Map();

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function call(role, method, route, body, expected = 200, form = false) {
  const headers = {};
  if (cookies.has(role)) headers.cookie = cookies.get(role);
  if (body !== undefined && !form) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${route}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
  });
  return expectedStatus(response, expected, `${role} ${method} ${route}`);
}

async function login(role, identifier, password) {
  const response = await expectedStatus(
    await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    }),
    200,
    `${role} login`,
  );
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`${role} login omitted session cookie`);
  cookies.set(role, cookie);
  return response.json();
}

async function main() {
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 5000 });
  mongoConnected = true;
  const db = mongoose.connection.db;
  if ((await db.listCollections().toArray()).length) {
    throw new Error("Generated disposable database was not empty");
  }
  await db.collection("verification_control").insertOne({ _id: runId, dbName });
  await db.collection("users").insertOne({
    name: "Disposable Verification Admin",
    email: adminEmail,
    username: `verify-${runId}`,
    password: await bcrypt.hash(adminPassword, 4),
    role: "superadmin",
    isActive: true,
    dateJoined: new Date(),
  });
  await mongoose.disconnect();
  mongoConnected = false;

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const nextBin = path.join(
    root,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        MONGODB_URI: testUri,
        COOKIE_SECURE: "true",
        CRON_SECRET: randomSecret(),
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  child.stdout.on("data", (data) => {
    serverOutput = (serverOutput + data).slice(-12000);
  });
  child.stderr.on("data", (data) => {
    serverOutput = (serverOutput + data).slice(-12000);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null)
      throw new Error(`Next server exited early: ${serverOutput}`);
    try {
      const response = await fetch(`${base}/login`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(1000);
  }
  if (!ready)
    throw new Error(`Next server did not become ready: ${serverOutput}`);

  await login("superadmin", adminEmail, adminPassword);
  const grade = await (
    await call(
      "superadmin",
      "POST",
      "/api/admin/academic",
      { kind: "grade", level: 11 },
      201,
    )
  ).json();
  const section = await (
    await call(
      "superadmin",
      "POST",
      "/api/admin/academic",
      { kind: "section", gradeId: String(grade._id), name: "V1VERIFY" },
      201,
    )
  ).json();
  const subject = await (
    await call(
      "superadmin",
      "POST",
      "/api/admin/academic",
      { kind: "subject", name: `V1 Verify ${runId.slice(0, 8)}` },
      201,
    )
  ).json();
  const teacherCreated = await (
    await call(
      "superadmin",
      "POST",
      "/api/admin/users",
      {
        name: "Disposable Teacher",
        email: `teacher-${runId}@example.invalid`,
        role: "teacher",
      },
      201,
    )
  ).json();
  const studentCreated = await (
    await call(
      "superadmin",
      "POST",
      "/api/admin/users",
      {
        name: "Disposable Student",
        email: `student-${runId}@example.invalid`,
        role: "student",
        gradeId: String(grade._id),
        sectionId: String(section._id),
      },
      201,
    )
  ).json();
  const assignment = await (
    await call(
      "superadmin",
      "POST",
      "/api/admin/teaching-assignments",
      {
        teacherId: teacherCreated.user.id,
        gradeId: String(grade._id),
        sectionId: String(section._id),
        subjectId: String(subject._id),
      },
      201,
    )
  ).json();
  await call("superadmin", "GET", "/api/admin/users", undefined, 200);
  await call("superadmin", "GET", "/api/admin/academic", undefined, 200);
  console.log(
    "Admin: login, academic records, teacher/student accounts, assignment, list views passed",
  );

  await login(
    "teacher",
    teacherCreated.credentials.username,
    teacherCreated.credentials.temporaryPassword,
  );
  const teacherAssignments = await (
    await call("teacher", "GET", "/api/teacher/assignments")
  ).json();
  if (
    !Array.isArray(teacherAssignments) ||
    !teacherAssignments.some((item) => String(item._id) === assignment.id)
  ) {
    throw new Error(
      "Teacher assignment scope did not include the new assignment",
    );
  }
  const test = await (
    await call(
      "teacher",
      "POST",
      "/api/teacher/tests",
      {
        title: "Disposable V1 MCQ",
        assignmentId: assignment.id,
        durationMinutes: 60,
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
      },
      201,
    )
  ).json();
  const csv = new FormData();
  csv.append("testId", test.id);
  csv.append("subject", subject.name);
  csv.append(
    "file",
    new File(
      [
        "question,optionA,optionB,optionC,optionD\n" +
          "Two plus two?,Three,Four,Five,Six\n",
      ],
      "questions.csv",
      { type: "text/csv" },
    ),
  );
  const upload = await (
    await call(
      "teacher",
      "POST",
      "/api/teacher/upload/questions",
      csv,
      200,
      true,
    )
  ).json();
  if (upload.count !== 1)
    throw new Error("CSV question upload did not create one question");
  await call("teacher", "PATCH", `/api/teacher/tests/${test.id}`, {
    isPublished: true,
  });
  await call("teacher", "GET", "/api/teacher/tests");
  await call("teacher", "GET", "/api/admin/academic", undefined, 403);
  console.log(
    "Teacher: scoped assignment, MCQ creation, CSV upload, publish and role denial passed",
  );

  await login(
    "student",
    studentCreated.credentials.username,
    studentCreated.credentials.temporaryPassword,
  );
  const available = await (
    await call("student", "GET", "/api/student/assignments/today")
  ).json();
  if (!available.tests?.some((item) => String(item._id) === test.id)) {
    throw new Error("Student did not receive assigned published exam");
  }
  const questionRoute = `/api/student/tests/${test.id}/question?index=1`;
  const question = await (await call("student", "GET", questionRoute)).json();
  const repeated = await (await call("student", "GET", questionRoute)).json();
  if (
    question.attemptId !== repeated.attemptId ||
    question.question !== "Two plus two?" ||
    "correctAnswerIndex" in question ||
    "correctAnswer" in question
  ) {
    throw new Error(
      "Student question or concurrent-safe active attempt check failed",
    );
  }
  await call(
    "teacher",
    "POST",
    `/api/student/tests/${test.id}/submit-question`,
    {
      attemptId: question.attemptId,
      questionNumber: 1,
      chosenOption: 1,
    },
    403,
  );
  await call(
    "student",
    "POST",
    `/api/student/tests/${test.id}/submit-question`,
    {
      attemptId: question.attemptId,
      questionNumber: 1,
      chosenOption: 1,
      timeTakenSec: 4,
    },
  );
  await call(
    "student",
    "POST",
    `/api/student/tests/${test.id}/submit-question`,
    {
      attemptId: question.attemptId,
      questionNumber: 1,
      chosenOption: 0,
      timeTakenSec: 5,
    },
    409,
  );
  const submitted = await (
    await call(
      "student",
      "POST",
      `/api/student/tests/${test.id}/submit-final`,
      {
        attemptId: question.attemptId,
      },
    )
  ).json();
  await call(
    "student",
    "GET",
    `/api/student/results/${submitted.resultId}`,
    undefined,
    404,
  );
  const pendingTeacherDashboard = await (
    await call("teacher", "GET", "/api/teacher/dashboard")
  ).json();
  const pendingAdminDashboard = await (
    await call("superadmin", "GET", "/api/admin/dashboard")
  ).json();
  if (
    pendingTeacherDashboard.summary?.totalResults !== 0 ||
    pendingTeacherDashboard.summary?.avgPercentage !== 0 ||
    pendingAdminDashboard.summary?.avgPerformance !== 0
  ) {
    throw new Error("Ungraded submissions were included in dashboard performance metrics");
  }
  const teacherResult = await (
    await call("teacher", "GET", `/api/teacher/results/${submitted.resultId}`)
  ).json();
  if (
    teacherResult.questions?.some(
      (item) => "correctAnswerIndex" in item || "correctAnswer" in item,
    )
  ) {
    throw new Error("Teacher review response exposed a question answer key");
  }
  if (
    teacherResult.finalized !== false ||
    teacherResult.questions?.[0]?.isCorrect !== null ||
    teacherResult.correctAnswers !== 0 ||
    teacherResult.percentage !== 0
  ) {
    throw new Error("Student submission was automatically graded before teacher review");
  }
  await call("teacher", "PATCH", `/api/teacher/results/${submitted.resultId}`, {
    marks: [{ questionNumber: 1, isCorrect: true }],
    finalize: true,
  });
  await call(
    "student",
    "GET",
    `/api/student/results/${submitted.resultId}`,
    undefined,
    404,
  );
  const finalizedTeacherResult = await (
    await call("teacher", "GET", `/api/teacher/results/${submitted.resultId}`)
  ).json();
  if (
    finalizedTeacherResult.finalized !== true ||
    finalizedTeacherResult.questions?.[0]?.isCorrect !== true
  ) {
    throw new Error("Teacher marks were not saved and finalized correctly");
  }
  await call(
    "teacher",
    "PATCH",
    `/api/teacher/results/${submitted.resultId}`,
    { marks: [{ questionNumber: 1, isCorrect: false }] },
    409,
  );
  const finalizedTeacherDashboard = await (
    await call("teacher", "GET", "/api/teacher/dashboard")
  ).json();
  const finalizedAdminDashboard = await (
    await call("superadmin", "GET", "/api/admin/dashboard")
  ).json();
  if (
    finalizedTeacherDashboard.summary?.totalResults !== 1 ||
    finalizedTeacherDashboard.summary?.avgPercentage !== 100 ||
    finalizedAdminDashboard.summary?.avgPerformance !== 100
  ) {
    throw new Error("Finalized manual marks were not reflected in dashboard performance metrics");
  }
  await call("teacher", "PATCH", `/api/teacher/results/${submitted.resultId}`, {
    publish: true,
  });
  const published = await (
    await call("student", "GET", `/api/student/results/${submitted.resultId}`)
  ).json();
  if (!published.result?.published || !published.result?.finalized) {
    throw new Error(
      "Published student result detail did not return finalized published result",
    );
  }
  const studentReview = await (
    await call("student", "GET", `/api/student/review/${submitted.resultId}`)
  ).json();
  if (
    studentReview.questions?.[0]?.isCorrect !== true ||
    studentReview.questions?.some(
      (item) => "correctAnswerIndex" in item || "correctAnswer" in item,
    )
  ) {
    throw new Error("Student review did not return teacher mark without answer key");
  }
  const completed = await (
    await call("student", "GET", "/api/student/results/completed")
  ).json();
  if (
    !completed.results?.some((item) => String(item._id) === submitted.resultId)
  ) {
    throw new Error("Published result missing from student completed list");
  }
  await call("student", "GET", questionRoute, undefined, 409);
  const expiryTest = await (
    await call(
      "teacher",
      "POST",
      "/api/teacher/tests",
      {
        title: "Disposable V1 Expiry MCQ",
        assignmentId: assignment.id,
        durationMinutes: 60,
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
      },
      201,
    )
  ).json();
  const expiryCsv = new FormData();
  expiryCsv.append("testId", expiryTest.id);
  expiryCsv.append("subject", subject.name);
  expiryCsv.append(
    "file",
    new File(
      [
        "question,optionA,optionB,optionC,optionD\n" +
          "One plus one?,One,Two,Three,Four\n",
      ],
      "expiry-questions.csv",
      { type: "text/csv" },
    ),
  );
  await call(
    "teacher",
    "POST",
    "/api/teacher/upload/questions",
    expiryCsv,
    200,
    true,
  );
  await call("teacher", "PATCH", `/api/teacher/tests/${expiryTest.id}`, {
    isPublished: true,
  });
  const expiryQuestion = await (
    await call(
      "student",
      "GET",
      `/api/student/tests/${expiryTest.id}/question?index=1`,
    )
  ).json();
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 5000 });
  mongoConnected = true;
  await mongoose.connection.db
    .collection("tests")
    .updateOne(
      { _id: new mongoose.Types.ObjectId(expiryTest.id) },
      { $set: { endTime: new Date(Date.now() - 1000) } },
    );
  await mongoose.disconnect();
  mongoConnected = false;
  const expired = await call(
    "student",
    "GET",
    `/api/student/tests/${expiryTest.id}/question?index=1`,
    undefined,
    409,
  );
  if (!(await expired.json()).autoSubmitted) {
    throw new Error("Expired exam did not report automatic submission");
  }
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 5000 });
  mongoConnected = true;
  const expiredResult = await mongoose.connection.db
    .collection("results")
    .findOne({ _id: new mongoose.Types.ObjectId(expiryQuestion.attemptId) });
  await mongoose.disconnect();
  mongoConnected = false;
  if (!expiredResult?.testCompleted || !expiredResult?.autoSubmitted) {
    throw new Error(
      "Expired exam result was not completed and marked automatic",
    );
  }
  await call("student", "POST", "/api/auth/logout", undefined, 200);
  await call("teacher", "POST", "/api/auth/logout", undefined, 200);
  await call("superadmin", "POST", "/api/auth/logout", undefined, 200);
  console.log(
    "Student: exam visibility, answer save/immutability, submit, unpublished gating, finalized publication, result detail, attempt limit and expiry auto-submit passed",
  );
}

try {
  await main();
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(5000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  if (mongoConnected) await mongoose.disconnect();
  const cleanup = new mongoose.Mongoose();
  await cleanup.connect(testUri, { serverSelectionTimeoutMS: 5000 });
  const control = await cleanup.connection.db
    .collection("verification_control")
    .findOne({ _id: runId, dbName });
  if (!control || !dbName.startsWith("oes_v1_disposable_")) {
    await cleanup.disconnect();
    console.error(
      "Refusing cleanup: disposable database ownership marker did not match",
    );
    process.exitCode = 1;
  } else {
    await cleanup.connection.db.dropDatabase();
    await cleanup.disconnect();
    console.log(
      "Disposable verification database removed after exact run-marker check",
    );
  }
}
