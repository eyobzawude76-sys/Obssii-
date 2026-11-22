import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { decryptString } from "@/lib/encryption";
import dbConnect from "@/lib/mongoose-connect";
import { getStudentExamAccess } from "@/lib/student-exam-access";
import { getAuthOrThrow } from "@/lib/with-auth";
import Question from "@/models/Question";
import Result from "@/models/Result";

type ReviewQuestion = {
  questionNumber: number;
  encryptedQuestion: string;
  encryptedOptions: string[];
  explanation?: string;
};

type AttemptAnswer = {
  questionNumber: number;
  chosenOption?: number;
  isCorrect?: boolean;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ testId: string }> },
) {
  const auth = await getAuthOrThrow("student");
  if ("error" in auth) return auth.error;
  await dbConnect();

  const { testId: resultId } = await ctx.params;
  if (!mongoose.Types.ObjectId.isValid(resultId)) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  const result = (await Result.findOne({
    _id: resultId,
    student: auth.user.id,
    testCompleted: true,
    published: true,
    finalized: true,
  }).lean()) as unknown as {
    _id: unknown;
    test: unknown;
    answers?: AttemptAnswer[];
    correctAnswers: number;
    percentage: number;
  } | null;
  if (!result) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  const access = await getStudentExamAccess(auth.user.id, String(result.test));
  if (!access.ok) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  const questionDoc = (await Question.findOne({
    testId: result.test,
  }).lean()) as unknown as { questions?: ReviewQuestion[] } | null;
  if (!questionDoc) {
    return NextResponse.json({ error: "No questions found." }, { status: 404 });
  }

  const answers = result.answers || [];
  const questions = questionDoc.questions || [];
  const reviewData = questions.map((question) => {
    const studentAnswer = answers.find(
      (answer) => answer.questionNumber === question.questionNumber,
    );

    return {
      questionNumber: question.questionNumber,
      question: decryptString(question.encryptedQuestion),
      options: question.encryptedOptions.map((option) => decryptString(option)),
      studentAnswerIndex: studentAnswer?.chosenOption ?? null,
      isCorrect: studentAnswer?.chosenOption == null ? null : studentAnswer.isCorrect ?? null,
      explanation: question.explanation || null,
    };
  });

  return NextResponse.json({
    testTitle: access.test.title,
    testSubject: access.test.subject,
    totalQuestions: questions.length,
    correctAnswers: result.correctAnswers,
    percentage: result.percentage,
    questions: reviewData,
  });
}
