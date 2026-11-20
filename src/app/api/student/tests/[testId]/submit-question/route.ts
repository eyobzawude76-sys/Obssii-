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

type QuestionRecord = {
  questionNumber: number;
  encryptedOptions: string[];
};

type SavedAnswer = {
  questionNumber: number;
  chosenOption?: number;
  timeTakenSec?: number;
};

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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
  }

  const { attemptId, questionNumber, chosenOption, timeTakenSec } = body as {
    attemptId?: unknown;
    questionNumber?: unknown;
    chosenOption?: unknown;
    timeTakenSec?: unknown;
  };
  if (
    typeof attemptId !== "string" ||
    !mongoose.Types.ObjectId.isValid(attemptId) ||
    !Number.isInteger(questionNumber) ||
    !Number.isInteger(chosenOption) ||
    (questionNumber as number) < 1 ||
    (chosenOption as number) < 0 ||
    (chosenOption as number) > 3
  ) {
    return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
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

  const questionSet = (await Question.findOne({
    testId,
  }).lean()) as unknown as {
    questions?: QuestionRecord[];
  } | null;
  const questions = questionSet?.questions || [];
  const question = questions.find(
    (item) => item.questionNumber === questionNumber,
  );
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }
  if (
    (chosenOption as number) >= question.encryptedOptions.length ||
    question.encryptedOptions.length > 4
  ) {
    return NextResponse.json(
      { error: "Invalid answer option." },
      { status: 400 },
    );
  }

  const result = await Result.findOne({
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
    return NextResponse.json(
      completedAttempt
        ? {
            error: "This attempt has already been submitted.",
            attemptCompleted: true,
            autoSubmitted: completedAttempt.autoSubmitted === true,
          }
        : { error: "Active attempt not found." },
      { status: 409 },
    );
  }

  const deadline = getAttemptDeadline(result, access.test);
  if (deadline !== null && Date.now() >= deadline) {
    await finalizeExpiredAttempt(access.test, auth.user.id);
    return NextResponse.json(
      {
        error: "The exam time has ended.",
        attemptCompleted: true,
        autoSubmitted: true,
      },
      { status: 409 },
    );
  }

  const elapsedSeconds =
    typeof timeTakenSec === "number" && Number.isFinite(timeTakenSec)
      ? Math.max(0, Math.floor(timeTakenSec))
      : 0;
  const answer = {
    questionNumber: questionNumber as number,
    chosenOption: chosenOption as number,
    timeTakenSec: elapsedSeconds,
  };
  const saved = await Result.updateOne(
    {
      _id: result._id,
      student: auth.user.id,
      test: testId,
      testCompleted: false,
      answers: {
        $not: { $elemMatch: { questionNumber: questionNumber as number } },
      },
    },
    { $push: { answers: answer } },
  );

  if (saved.modifiedCount === 1) {
    return NextResponse.json({ ok: true, id: result._id });
  }

  const currentAttempt = (await Result.findOne({
    _id: result._id,
    student: auth.user.id,
    test: testId,
    testCompleted: false,
  }).lean()) as unknown as {
    answers?: SavedAnswer[];
  } | null;
  if (!currentAttempt) {
    const completedAttempt = (await Result.findOne({
      _id: result._id,
      student: auth.user.id,
      test: testId,
      testCompleted: true,
    })
      .select("_id autoSubmitted")
      .lean()) as unknown as { _id: unknown; autoSubmitted?: boolean } | null;
    return NextResponse.json(
      {
        error: "This attempt has already been submitted.",
        attemptCompleted: true,
        autoSubmitted: completedAttempt?.autoSubmitted === true,
      },
      { status: 409 },
    );
  }

  const savedAnswer = (currentAttempt.answers as SavedAnswer[]).find(
    (item) => item.questionNumber === questionNumber,
  );
  if (savedAnswer?.chosenOption === chosenOption) {
    return NextResponse.json({
      ok: true,
      id: result._id,
      idempotent: true,
    });
  }
  if (savedAnswer) {
    return NextResponse.json(
      {
        error: "This answer was already saved and cannot be changed.",
        answerAlreadySubmitted: true,
        savedOption: savedAnswer.chosenOption,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: "The answer could not be saved. Retry the request." },
    { status: 409 },
  );
}
