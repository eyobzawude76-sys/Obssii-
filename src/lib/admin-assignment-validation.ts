const TEST_STATUSES = new Set(["upcoming", "ongoing", "completed", "assigned"]);
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type AssignmentDates = {
  testDate?: Date;
  startTime?: Date;
  endTime?: Date;
};

export type CreateAssignmentInput = {
  testId: string;
  studentId: string;
  testDate: Date;
  startTime: Date;
  endTime: Date;
  durationMinutes?: number;
  status?: string;
};

export type UpdateAssignmentInput = {
  testId: string;
  updates: AssignmentDates & {
    durationMinutes?: number;
    status?: string;
    assignedStudents?: string[];
  };
};

export type RemoveAssignmentInput = { testId: string; studentId: string };

const CREATE_FIELDS = new Set([
  "testId",
  "studentId",
  "testDate",
  "startTime",
  "endTime",
  "durationMinutes",
  "status",
]);
const PATCH_BODY_FIELDS = new Set(["testId", "updates"]);
const PATCH_FIELDS = new Set([
  "testDate",
  "startTime",
  "endTime",
  "durationMinutes",
  "status",
  "assignedStudents",
]);
const DELETE_FIELDS = new Set(["testId", "studentId"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validDuration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validStatus(value: unknown): value is string {
  return typeof value === "string" && TEST_STATUSES.has(value);
}

function validDateOrder(startTime: Date, endTime: Date): boolean {
  return endTime.getTime() > startTime.getTime();
}

export function validateCreateAssignment(
  input: unknown,
): ValidationResult<CreateAssignmentInput> {
  if (!isRecord(input) || !hasOnlyFields(input, CREATE_FIELDS)) {
    return { ok: false, error: "Unexpected or invalid request fields" };
  }
  if (!validId(input.testId) || !validId(input.studentId)) {
    return { ok: false, error: "Valid testId and studentId are required" };
  }
  const testDate = parseDate(input.testDate);
  const startTime = parseDate(input.startTime);
  const endTime = parseDate(input.endTime);
  if (!testDate || !startTime || !endTime) {
    return {
      ok: false,
      error: "Valid testDate, startTime, and endTime are required",
    };
  }
  if (!validDateOrder(startTime, endTime)) {
    return { ok: false, error: "endTime must be after startTime" };
  }
  if (
    input.durationMinutes !== undefined &&
    !validDuration(input.durationMinutes)
  ) {
    return { ok: false, error: "durationMinutes must be a positive integer" };
  }
  if (input.status !== undefined && !validStatus(input.status)) {
    return { ok: false, error: "status is invalid" };
  }
  return {
    ok: true,
    value: {
      testId: input.testId,
      studentId: input.studentId,
      testDate,
      startTime,
      endTime,
      ...(input.durationMinutes !== undefined
        ? { durationMinutes: input.durationMinutes as number }
        : {}),
      ...(input.status !== undefined ? { status: input.status as string } : {}),
    },
  };
}

export function validateUpdateAssignment(
  input: unknown,
): ValidationResult<UpdateAssignmentInput> {
  if (!isRecord(input) || !hasOnlyFields(input, PATCH_BODY_FIELDS)) {
    return { ok: false, error: "Unexpected or invalid request fields" };
  }
  if (!validId(input.testId)) {
    return { ok: false, error: "Valid testId is required" };
  }
  if (!isRecord(input.updates) || !hasOnlyFields(input.updates, PATCH_FIELDS)) {
    return { ok: false, error: "Unexpected or invalid update fields" };
  }
  const keys = Object.keys(input.updates);
  if (keys.length === 0)
    return { ok: false, error: "At least one update is required" };

  const updates: UpdateAssignmentInput["updates"] = {};
  for (const field of ["testDate", "startTime", "endTime"] as const) {
    if (input.updates[field] !== undefined) {
      const date = parseDate(input.updates[field]);
      if (!date) return { ok: false, error: `${field} must be a valid date` };
      updates[field] = date;
    }
  }
  if (
    input.updates.durationMinutes !== undefined &&
    !validDuration(input.updates.durationMinutes)
  ) {
    return { ok: false, error: "durationMinutes must be a positive integer" };
  }
  if (
    input.updates.status !== undefined &&
    !validStatus(input.updates.status)
  ) {
    return { ok: false, error: "status is invalid" };
  }
  if (input.updates.assignedStudents !== undefined) {
    if (
      !Array.isArray(input.updates.assignedStudents) ||
      !input.updates.assignedStudents.every(validId) ||
      new Set(input.updates.assignedStudents).size !==
        input.updates.assignedStudents.length
    ) {
      return {
        ok: false,
        error: "assignedStudents must contain unique valid IDs",
      };
    }
    updates.assignedStudents = input.updates.assignedStudents;
  }
  if (
    updates.startTime &&
    updates.endTime &&
    !validDateOrder(updates.startTime, updates.endTime)
  ) {
    return { ok: false, error: "endTime must be after startTime" };
  }
  return {
    ok: true,
    value: {
      testId: input.testId,
      updates: {
        ...updates,
        ...(input.updates.durationMinutes !== undefined
          ? { durationMinutes: input.updates.durationMinutes as number }
          : {}),
        ...(input.updates.status !== undefined
          ? { status: input.updates.status as string }
          : {}),
      },
    },
  };
}

export function validateRemoveAssignment(
  input: unknown,
): ValidationResult<RemoveAssignmentInput> {
  if (!isRecord(input) || !hasOnlyFields(input, DELETE_FIELDS)) {
    return { ok: false, error: "Unexpected or invalid request fields" };
  }
  if (!validId(input.testId) || !validId(input.studentId)) {
    return { ok: false, error: "Valid testId and studentId are required" };
  }
  return {
    ok: true,
    value: { testId: input.testId, studentId: input.studentId },
  };
}

export function validateDateRange(
  startTime: Date | undefined,
  endTime: Date | undefined,
): boolean {
  return !startTime || !endTime || validDateOrder(startTime, endTime);
}
