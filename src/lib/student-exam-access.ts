import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose-connect";
import {
  type ExamTiming,
  finalizeExpiredAttempt,
  getAttemptDeadline,
} from "@/lib/teacher-exams";
import Grade from "@/models/Grade";
import Result from "@/models/Result";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import TeacherAssignment from "@/models/TeacherAssignment";
import Test from "@/models/Test";
import User from "@/models/User";

export { finalizeExpiredAttempt, getAttemptDeadline };

type StudentProfile = {
  _id: unknown;
  role: string;
  grade?: unknown;
  section?: unknown;
};

export type StudentExamTest = ExamTiming & {
  teacher?: unknown;
  assignment?: unknown;
  grade?: unknown;
  section?: unknown;
  subjectId?: unknown;
  subject?: string;
  isPublished?: boolean;
  allowRetake?: boolean;
  assignedStudents?: unknown[];
  title?: string;
  startTime?: Date | string | null;
  termsAndConditions?: string[];
};

type AccessResult =
  | { ok: true; mode: "legacy" | "v1" }
  | { ok: false; status: 403 | 404; error: string };

type ActiveAttemptResult =
  | {
      ok: true;
      attempt: NonNullable<Awaited<ReturnType<typeof findActiveAttempt>>>;
    }
  | {
      ok: false;
      status: 409;
      error: string;
      autoSubmitted?: boolean;
      resultId?: unknown;
    };

const INCOMPLETE_ASSIGNMENT_ERROR =
  "This exam has incomplete or inconsistent assignment metadata.";

function isPresent(value: unknown) {
  return value !== undefined && value !== null;
}

function isValidId(value: unknown) {
  return isPresent(value) && mongoose.Types.ObjectId.isValid(value as string);
}

function sameId(left: unknown, right: unknown) {
  return isPresent(left) && isPresent(right) && String(left) === String(right);
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

export async function getStudentExamProfile(studentId: string) {
  await dbConnect();
  return (await User.findOne({ _id: studentId, role: "student" })
    .select("_id role grade section")
    .lean()) as unknown as StudentProfile | null;
}

export async function validateStudentExamAssignment(
  student: StudentProfile,
  test: StudentExamTest,
): Promise<AccessResult> {
  if (
    !test.assignedStudents?.some((assignedStudent) =>
      sameId(assignedStudent, student._id),
    )
  ) {
    return {
      ok: false,
      status: 403,
      error: "You are not assigned to this exam.",
    };
  }

  if (test.isPublished !== true) {
    return {
      ok: false,
      status: 403,
      error: "This exam is not published.",
    };
  }

  const metadata = [test.assignment, test.grade, test.section, test.subjectId];
  const hasAnyMetadata = metadata.some(isPresent);
  if (!hasAnyMetadata) return { ok: true, mode: "legacy" };

  if (
    metadata.some((value) => !isValidId(value)) ||
    !isValidId(test.teacher) ||
    !isValidId(student.grade) ||
    !isValidId(student.section)
  ) {
    return {
      ok: false,
      status: 403,
      error: INCOMPLETE_ASSIGNMENT_ERROR,
    };
  }

  const [
    teacherAssignment,
    grade,
    examSection,
    subject,
    studentGrade,
    studentSection,
  ] = await Promise.all([
    TeacherAssignment.findOne({
      _id: test.assignment,
      teacher: test.teacher,
    })
      .select("teacher grade section subject")
      .lean() as unknown as Promise<{
      teacher: unknown;
      grade: unknown;
      section: unknown;
      subject: unknown;
    } | null>,
    Grade.findById(test.grade).select("_id").lean() as unknown as Promise<{
      _id: unknown;
    } | null>,
    Section.findById(test.section)
      .select("grade")
      .lean() as unknown as Promise<{
      grade: unknown;
    } | null>,
    Subject.findById(test.subjectId)
      .select("name")
      .lean() as unknown as Promise<{
      name: string;
    } | null>,
    Grade.findById(student.grade).select("_id").lean() as unknown as Promise<{
      _id: unknown;
    } | null>,
    Section.findOne({ _id: student.section, grade: student.grade })
      .select("_id")
      .lean() as unknown as Promise<{ _id: unknown } | null>,
  ]);

  const assignmentMatchesTest =
    teacherAssignment &&
    sameId(teacherAssignment.grade, test.grade) &&
    sameId(teacherAssignment.section, test.section) &&
    sameId(teacherAssignment.subject, test.subjectId);
  const examClassIsValid =
    grade && examSection && sameId(examSection.grade, test.grade);
  const studentClassIsValid = studentGrade && studentSection;
  const subjectMatchesTest =
    subject &&
    normalized(subject.name) &&
    normalized(subject.name) === normalized(test.subject);
  const studentMatchesAssignment =
    sameId(student.grade, teacherAssignment?.grade) &&
    sameId(student.section, teacherAssignment?.section);

  if (
    !assignmentMatchesTest ||
    !examClassIsValid ||
    !studentClassIsValid ||
    !subjectMatchesTest ||
    !studentMatchesAssignment
  ) {
    return {
      ok: false,
      status: 403,
      error: INCOMPLETE_ASSIGNMENT_ERROR,
    };
  }

  return { ok: true, mode: "v1" };
}

export async function getStudentExamAccess(studentId: string, testId: string) {
  await dbConnect();
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    return {
      ok: false as const,
      status: 404 as const,
      error: "Exam not found.",
    };
  }

  const [student, test] = await Promise.all([
    User.findOne({ _id: studentId, role: "student" })
      .select("_id role grade section")
      .lean(),
    Test.findOne({ _id: testId, assignedStudents: studentId }).lean(),
  ]);
  if (!student || !test) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "You are not assigned to this exam.",
    };
  }

  const access = await validateStudentExamAssignment(
    student as unknown as StudentProfile,
    test as unknown as StudentExamTest,
  );
  return access.ok
    ? {
        ok: true as const,
        student: student as unknown as StudentProfile,
        test: test as unknown as StudentExamTest,
        mode: access.mode,
      }
    : access;
}

export function getExamAvailabilityError(
  test: StudentExamTest,
  now = Date.now(),
) {
  if (test.startTime) {
    const startsAt = new Date(test.startTime).getTime();
    if (!Number.isFinite(startsAt)) return "This exam has an invalid schedule.";
    if (now < startsAt) return "This exam has not started yet.";
  }

  if (test.endTime) {
    const endsAt = new Date(test.endTime).getTime();
    if (!Number.isFinite(endsAt)) return "This exam has an invalid schedule.";
    if (now >= endsAt) return "This exam has ended.";
  }

  return null;
}

async function findActiveAttempt(studentId: string, testId: string) {
  return Result.findOne({
    student: studentId,
    test: testId,
    testCompleted: false,
  }).sort({ attemptNumber: -1 });
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function getOrCreateActiveAttempt(
  studentId: string,
  test: StudentExamTest,
  totalQuestions: number,
): Promise<ActiveAttemptResult> {
  const testId = String(test._id);
  let activeAttempt = await findActiveAttempt(studentId, testId);

  if (activeAttempt) {
    const expiredAttemptId = activeAttempt._id;
    await finalizeExpiredAttempt(test, studentId);
    activeAttempt = await findActiveAttempt(studentId, testId);
    if (activeAttempt) return { ok: true, attempt: activeAttempt };
    const completedAttempt = (await Result.findOne({
      _id: expiredAttemptId,
      student: studentId,
      test: testId,
      testCompleted: true,
    })
      .select("_id autoSubmitted")
      .lean()) as unknown as { _id: unknown; autoSubmitted?: boolean } | null;
    return {
      ok: false,
      status: 409,
      error: "This attempt has expired.",
      autoSubmitted: Boolean(completedAttempt?.autoSubmitted),
      resultId: completedAttempt?._id,
    };
  }

  const previousAttempts = await Result.countDocuments({
    student: studentId,
    test: testId,
  });
  if (previousAttempts > 0 && test.allowRetake !== true) {
    return {
      ok: false,
      status: 409,
      error: "No attempts remaining.",
    };
  }

  try {
    const attempt = await Result.create({
      student: studentId,
      test: testId,
      totalQuestions,
      correctAnswers: 0,
      percentage: 0,
      answers: [],
      attemptNumber: previousAttempts + 1,
      startedAt: new Date(),
      testCompleted: false,
      autoSubmitted: false,
      finalized: false,
      published: false,
    });
    return { ok: true, attempt };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    // This path is concurrency-safe only after the separately approved
    // partial unique index on active (student, test) attempts is installed.
    await finalizeExpiredAttempt(test, studentId);
    activeAttempt = await findActiveAttempt(studentId, testId);
    if (activeAttempt) return { ok: true, attempt: activeAttempt };
    return {
      ok: false,
      status: 409,
      error:
        "An attempt changed while this request was being processed. Retry once.",
    };
  }
}
