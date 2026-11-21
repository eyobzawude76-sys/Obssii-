import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import {
  finalizeExpiredAttempt,
  getAttemptDeadline,
  getExamAvailabilityError,
  getStudentExamAccess,
} from "@/lib/student-exam-access";
import { getAuthOrThrow } from "@/lib/with-auth";
import Question from "@/models/Question";
import Result from "@/models/Result";

function submittedResponse(resultId: unknown, autoSubmitted = false) {
  return NextResponse.json({
    ok: true,
    resultId: String(resultId),
    autoSubmitted,
    awaitingPublication: true,
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ testId: string }> },
) {
  const auth = await getAuthOrThrow("student");
  if ("error" in auth) return auth.error;

  const { testId } = await ctx.params;
  const access = await getStudentExamAccess(auth.user.id, testId);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const attemptId =
    body && typeof body === "object" && "attemptId" in body
      ? body.attemptId
      : null;
  if (
    typeof attemptId !== "string" ||
    !mongoose.Types.ObjectId.isValid(attemptId)
  ) {
    return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });
  }

  const availabilityError = getExamAvailabilityError(access.test);
  if (availabilityError && availabilityError !== "This exam has ended.") {
    return NextResponse.json({ error: availabilityError }, { status: 409 });
  }

  let result = await Result.findOne({
    _id: attemptId,
    student: auth.user.id,
    test: testId,
    testCompleted: false,
  });
  if (!result) {
    const completedAttempt = (await Result.findOne({
      _id: attemptId,
      student: auth.user.id,
      test: testId,
      testCompleted: true,
    })
      .select("_id autoSubmitted")
      .lean()) as unknown as { _id: unknown; autoSubmitted?: boolean } | null;
    if (completedAttempt) {
      return submittedResponse(
        completedAttempt._id,
        completedAttempt.autoSubmitted === true,
      );
    }
    return NextResponse.json(
      { error: "Active attempt not found." },
      { status: 409 },
    );
  }

  const deadline = getAttemptDeadline(result, access.test);
  if (
    availabilityError === "This exam has ended." ||
    (deadline !== null && Date.now() >= deadline)
  ) {
    await finalizeExpiredAttempt(access.test, auth.user.id);
    const completedAttempt = (await Result.findOne({
      _id: attemptId,
      student: auth.user.id,
      test: testId,
      testCompleted: true,
    })
      .select("_id autoSubmitted")
      .lean()) as unknown as { _id: unknown; autoSubmitted?: boolean } | null;
    if (!completedAttempt) {
      return NextResponse.json(
        { error: "Automatic submission could not be confirmed. Please retry." },
        { status: 409 },
      );
    }
    return submittedResponse(
      completedAttempt._id,
      completedAttempt.autoSubmitted === true,
    );
  }

  const questionSet = await Question.findOne({ testId })
    .select("questions.questionNumber")
    .lean();
  if (!questionSet) {
    return NextResponse.json(
      { error: "Exam questions are unavailable." },
      { status: 409 },
    );
  }
  const totalQuestions = questionSet.questions?.length || 0;
  const answers = result.answers || [];
  for (const answer of answers) {
    answer.isCorrect = undefined;
  }

  const finalized = await Result.updateOne(
    {
      _id: result._id,
      student: auth.user.id,
      test: testId,
      testCompleted: false,
    },
    {
      $set: {
        answers,
        correctAnswers: 0,
        totalQuestions,
        percentage: 0,
        testCompleted: true,
        finalized: false,
        gradingStarted: false,
        published: false,
        autoSubmitted: false,
        submittedAt: new Date(),
      },
    },
  );

  if (finalized.modifiedCount === 0) {
    result = await Result.findOne({
      _id: result._id,
      student: auth.user.id,
      test: testId,
      testCompleted: true,
    }).select("_id autoSubmitted");
    if (!result) {
      return NextResponse.json(
        { error: "Attempt could not be finalized. Please retry." },
        { status: 409 },
      );
    }
    return submittedResponse(result._id, result.autoSubmitted === true);
  }

  return submittedResponse(result._id);
}
