import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { decryptString } from "@/lib/encryption";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Question from "@/models/Question";
import Result from "@/models/Result";
import TeacherAssignment from "@/models/TeacherAssignment";
import Test from "@/models/Test";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ resultId: string }> },
) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { resultId } = await ctx.params;
  if (!mongoose.isValidObjectId(resultId))
    return NextResponse.json({ error: "Result not found" }, { status: 404 });

  // Get the result and populate student and test info
  const result: any = await Result.findById(resultId)
    .populate({
      path: "student",
      select: "name email studentId grade section",
      populate: [
        { path: "grade", select: "level" },
        { path: "section", select: "name" },
      ],
    })
    .populate("test", "title subject teacher assignment")
    .lean();

  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  // Verify teacher has access to this result
  const test = result.test as any;
  if (
    auth.user.role !== "admin" &&
    auth.user.role !== "superadmin" &&
    String(test.teacher) !== auth.user.id
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  if (
    auth.user.role === "teacher" &&
    (!test.assignment ||
      !(await TeacherAssignment.exists({
        _id: test.assignment,
        teacher: auth.user.id,
      })))
  )
    return NextResponse.json(
      { error: "Assignment access denied" },
      { status: 403 },
    );

  // Get all questions for this test
  const questionDoc = await Question.findOne({ testId: test._id }).lean();
  if (!questionDoc) {
    return NextResponse.json({ error: "Questions not found" }, { status: 404 });
  }

  // Decrypt questions and match with student's answers
  const questions = (questionDoc as any).questions || [];
  const studentAnswers = (result.answers as any[]) || [];

  const reviewData = questions.map((q: any) => {
    const studentAnswer = studentAnswers.find(
      (a) => a.questionNumber === q.questionNumber,
    );

    return {
      questionNumber: q.questionNumber,
      question: decryptString(q.encryptedQuestion),
      options: q.encryptedOptions.map((opt: string) => decryptString(opt)),
      studentAnswerIndex: studentAnswer?.chosenOption ?? null,
      isCorrect:
        result.gradingStarted === true || result.published === true
          ? studentAnswer?.isCorrect ?? null
          : null,
      explanation: q.explanation || null,
    };
  });

  return NextResponse.json({
    student: result.student,
    test: {
      _id: test._id,
      title: test.title,
      subject: test.subject,
    },
    totalQuestions: result.totalQuestions,
    correctAnswers: result.correctAnswers,
    percentage: result.percentage,
    submittedAt: result.submittedAt,
    finalized:
      (result as any).finalized === true &&
      (result.gradingStarted === true || result.published === true),
    published: (result as any).published || false,
    questions: reviewData,
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ resultId: string }> },
) {
  const auth = await getAuthOrThrow("teacher");
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { resultId } = await ctx.params;
  if (!mongoose.isValidObjectId(resultId))
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  const result: any = await Result.findById(resultId);
  if (!result)
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  const test = await Test.findOne({ _id: result.test, teacher: auth.user.id });
  if (!test)
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (
    !(test as any).assignment ||
    !(await TeacherAssignment.exists({
      _id: (test as any).assignment,
      teacher: auth.user.id,
    }))
  )
    return NextResponse.json(
      { error: "Assignment access denied" },
      { status: 403 },
    );
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!result.testCompleted)
    return NextResponse.json(
      { error: "Submission is not complete" },
      { status: 409 },
    );
  if (result.published)
    return NextResponse.json(
      { error: "Published results are locked" },
      { status: 409 },
    );
  if (Array.isArray(body?.marks)) {
    if (result.finalized && result.gradingStarted === true)
      return NextResponse.json(
        { error: "Finalized marks are locked" },
        { status: 409 },
      );
    if (result.gradingStarted !== true) {
      result.finalized = false;
      result.correctAnswers = 0;
      result.percentage = 0;
      for (const answer of result.answers as any[]) answer.isCorrect = undefined;
    }
    result.gradingStarted = true;
    const seenMarks = new Set<number>();
    for (const mark of body.marks) {
      if (
        !Number.isInteger(mark.questionNumber) ||
        typeof mark.isCorrect !== "boolean" ||
        seenMarks.has(mark.questionNumber)
      )
        return NextResponse.json(
          {
            error:
              "Each mark needs a question number and correct/incorrect value",
          },
          { status: 400 },
        );
      seenMarks.add(mark.questionNumber);
      const answer = result.answers.find(
        (item: any) => item.questionNumber === mark.questionNumber,
      );
      if (!answer)
        return NextResponse.json({ error: "Mark does not match a submitted answer." }, { status: 400 });
      answer.isCorrect = mark.isCorrect;
    }
    await result.save();
  }
  if (body?.finalize === true) {
    if (result.finalized && result.gradingStarted === true)
      return NextResponse.json(
        { error: "Finalized marks are locked" },
        { status: 409 },
      );
    if (result.gradingStarted !== true) {
      for (const answer of result.answers as any[]) answer.isCorrect = undefined;
      result.finalized = false;
      result.correctAnswers = 0;
      result.percentage = 0;
      result.gradingStarted = true;
    }
    if (!result.testCompleted)
      return NextResponse.json(
        { error: "Submission is not complete" },
        { status: 409 },
      );
    const questionDoc: any = await Question.findOne({
      testId: test._id,
    }).lean();
    const total = questionDoc?.questions?.length || result.totalQuestions;
    const unansweredForMarking = (result.answers as any[]).filter(
      (answer) => answer.chosenOption !== undefined && answer.chosenOption !== null && typeof answer.isCorrect !== "boolean",
    );
    if (unansweredForMarking.length > 0)
      return NextResponse.json({ error: "Mark every answered question before finalizing." }, { status: 409 });
    result.totalQuestions = total;
    result.correctAnswers = (result.answers as any[]).filter(
      (answer) => answer.isCorrect === true,
    ).length;
    result.percentage = total
      ? Math.round((result.correctAnswers / total) * 100)
      : 0;
    result.finalized = true;
    await result.save();
  }
  if (body?.publish === true) {
    if (!result.finalized || result.gradingStarted !== true)
      return NextResponse.json(
        { error: "Finalize marks before publishing" },
        { status: 409 },
      );
    result.published = true;
    await result.save();
  }
  return NextResponse.json({
    ok: true,
    finalized: result.finalized,
    published: result.published,
    correctAnswers: result.correctAnswers,
    percentage: result.percentage,
  });
}
