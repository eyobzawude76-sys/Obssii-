import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./release-validation-tests.mjs";

const {
  validateCreateAssignment,
  validateDateRange,
  validateRemoveAssignment,
  validateUpdateAssignment,
} = loadTypeScriptModule("src/lib/admin-assignment-validation.ts");

const testId = "0123456789abcdef01234567";
const studentId = "abcdef0123456789abcdef01";
const validCreate = {
  testId,
  studentId,
  testDate: "2026-11-18T00:00:00.000Z",
  startTime: "2026-11-18T08:00:00.000Z",
  endTime: "2026-11-18T09:00:00.000Z",
  durationMinutes: 60,
  status: "assigned",
};

test("valid assignment create input retains supported Admin fields", () => {
  const result = validateCreateAssignment(validCreate);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.testId, testId);
    assert.equal(result.value.studentId, studentId);
    assert.equal(result.value.durationMinutes, 60);
    assert.equal(result.value.status, "assigned");
    assert.ok(result.value.startTime instanceof Date);
  }
});

test("assignment create rejects unexpected fields, invalid values, and invalid time ranges", () => {
  assert.equal(
    validateCreateAssignment({ ...validCreate, isPublished: true }).ok,
    false,
  );
  assert.equal(
    validateCreateAssignment({ ...validCreate, testDate: "invalid" }).ok,
    false,
  );
  assert.equal(
    validateCreateAssignment({ ...validCreate, status: "draft" }).ok,
    false,
  );
  assert.equal(
    validateCreateAssignment({ ...validCreate, durationMinutes: 0 }).ok,
    false,
  );
  assert.equal(
    validateCreateAssignment({
      ...validCreate,
      startTime: "2026-11-18T09:00:00.000Z",
      endTime: "2026-11-18T08:00:00.000Z",
    }).ok,
    false,
  );
});

test("assignment update accepts the explicit allowlist and rejects mass assignment", () => {
  const result = validateUpdateAssignment({
    testId,
    updates: {
      status: "assigned",
      durationMinutes: 45,
      assignedStudents: [studentId],
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.updates.status, "assigned");
    assert.deepEqual(result.value.updates.assignedStudents, [studentId]);
  }
  assert.equal(
    validateUpdateAssignment({ testId, updates: { isPublished: true } }).ok,
    false,
  );
  assert.equal(
    validateUpdateAssignment({ testId, updates: { encryptionKey: "x" } }).ok,
    false,
  );
  assert.equal(
    validateUpdateAssignment({ testId, updates: { status: "unknown" } }).ok,
    false,
  );
  assert.equal(
    validateUpdateAssignment({
      testId,
      updates: { assignedStudents: [studentId, studentId] },
    }).ok,
    false,
  );
  assert.equal(validateUpdateAssignment({ testId, updates: {} }).ok, false);
});

test("partial update date ranges are checked against the other effective date", () => {
  const currentStart = new Date("2026-11-18T08:00:00.000Z");
  const currentEnd = new Date("2026-11-18T09:00:00.000Z");
  assert.equal(validateDateRange(currentStart, currentEnd), true);
  assert.equal(
    validateDateRange(new Date("2026-11-18T10:00:00.000Z"), currentEnd),
    false,
  );
});

test("assignment removal accepts only testId and studentId", () => {
  assert.deepEqual(validateRemoveAssignment({ testId, studentId }).ok, true);
  assert.equal(
    validateRemoveAssignment({ testId, studentId, role: "admin" }).ok,
    false,
  );
  assert.equal(
    validateRemoveAssignment({ testId, studentId: "bad-id" }).ok,
    false,
  );
});
