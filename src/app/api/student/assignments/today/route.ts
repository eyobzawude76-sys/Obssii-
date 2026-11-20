import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose-connect";
import {
  getExamAvailabilityError,
  getStudentExamProfile,
  validateStudentExamAssignment,
} from "@/lib/student-exam-access";
import { getAuthOrThrow } from "@/lib/with-auth";
import Result from "@/models/Result";
import Test from "@/models/Test";

export async function GET() {
  const auth = await getAuthOrThrow("student");
  if ("error" in auth) return auth.error;
  await dbConnect();

  const student = await getStudentExamProfile(auth.user.id);
  if (!student) {
    return NextResponse.json(
      { error: "Student account not found." },
      { status: 403 },
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tests = await Test.find({
    assignedStudents: auth.user.id,
    isPublished: true,
    testDate: { $gte: today },
  })
    .select(
      "title subject durationMinutes testDate startTime endTime allowRetake assignedStudents teacher assignment grade section subjectId isPublished",
    )
    .sort({ testDate: 1 })
    .lean();

  const completedResults = await Result.find({
    student: auth.user.id,
    testCompleted: true,
  })
    .select("test")
    .lean();
  const completedTestIds = new Set(
    completedResults.map((result) => String(result.test)),
  );
  const now = Date.now();
  const pendingTests = [];

  for (const test of tests) {
    const access = await validateStudentExamAssignment(student, test);
    if (!access.ok || getExamAvailabilityError(test, now)) continue;
    if (completedTestIds.has(String(test._id)) && test.allowRetake !== true) {
      continue;
    }
    pendingTests.push({
      ...test,
      retakeAvailable: completedTestIds.has(String(test._id)),
    });
  }

  return NextResponse.json({ tests: pendingTests });
}
