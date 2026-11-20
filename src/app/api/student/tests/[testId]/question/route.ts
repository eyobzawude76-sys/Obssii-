import { type NextRequest, NextResponse } from "next/server";
import { decryptString } from "@/lib/encryption";
import {
  finalizeExpiredAttempt,
  getAttemptDeadline,
  getExamAvailabilityError,
  getOrCreateActiveAttempt,
  getStudentExamAccess,
} from "@/lib/student-exam-access";
import { getAuthOrThrow } from "@/lib/with-auth";
import Question from "@/models/Question";

type EncryptedQuestion = {
  questionNumber: number;
  encryptedQuestion: string;
  encryptedOptions: string[];
};

export async function GET(
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

  const availabilityError = getExamAvailabilityError(access.test);
  if (availabilityError) {
    if (availabilityError === "This exam has ended.") {
      const autoSubmitted = await finalizeExpiredAttempt(
        access.test,
        auth.user.id,
      );
      return NextResponse.json(
        { error: availabilityError, autoSubmitted },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: availabilityError }, { status: 409 });
  }

  const index = Number(req.nextUrl.searchParams.get("index") || "1");
  if (!Number.isInteger(index) || index < 1) {
    return NextResponse.json(
      { error: "Invalid question number." },
      { status: 400 },
    );
  }

  const questionSet = (await Question.findOne({
    testId,
  }).lean()) as unknown as {
    questions?: EncryptedQuestion[];
  } | null;
  const questions = questionSet?.questions || [];
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "No questions are available." },
      { status: 404 },
    );
  }
  const question = questions.find((item) => item.questionNumber === index);
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const attemptResult = await getOrCreateActiveAttempt(
    auth.user.id,
    access.test,
    questions.length,
  );
  if (!attemptResult.ok) {
    if (attemptResult.error === "No attempts remaining.") {
      return NextResponse.json(
        { error: attemptResult.error, alreadySubmitted: true },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: attemptResult.error,
        autoSubmitted: attemptResult.autoSubmitted,
        resultId: attemptResult.resultId,
      },
      { status: attemptResult.status },
    );
  }

  const serverNow = Date.now();
  const deadlineAt = getAttemptDeadline(attemptResult.attempt, access.test);
  const savedAnswer = (
    attemptResult.attempt.answers as
      | Array<{ questionNumber: number; chosenOption?: number }>
      | undefined
  )?.find((answer) => answer.questionNumber === index);

  return NextResponse.json({
    questionNumber: question.questionNumber,
    question: decryptString(question.encryptedQuestion),
    options: question.encryptedOptions.map((option) => decryptString(option)),
    testTitle: access.test.title,
    totalQuestions: questions.length,
    attemptId: String(attemptResult.attempt._id),
    serverNow,
    deadlineAt,
    savedOption: savedAnswer?.chosenOption ?? null,
  });
}
