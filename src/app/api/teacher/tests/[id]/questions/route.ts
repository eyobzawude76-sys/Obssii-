import { type NextRequest, NextResponse } from "next/server";
import { decryptString, encryptString } from "@/lib/encryption";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Question from "@/models/Question";
import Result from "@/models/Result";
import TeacherAssignment from "@/models/TeacherAssignment";
import Test from "@/models/Test";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { id } = await ctx.params;
  if (auth.user.role === "teacher") {
    const test: any = await Test.findOne({
      _id: id,
      teacher: auth.user.id,
    }).lean();
    if (
      !test ||
      !test.assignment ||
      !(await TeacherAssignment.exists({
        _id: test.assignment,
        teacher: auth.user.id,
      }))
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const qs: any = await Question.findOne({ testId: id }).lean();
  if (!qs) return NextResponse.json({ questions: [] });
  const list = (qs.questions || []).map((q: any) => ({
    questionNumber: q.questionNumber,
    question: decryptString(q.encryptedQuestion),
    options: q.encryptedOptions.map((s: string) => decryptString(s)),
  }));
  return NextResponse.json({ questions: list });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { id } = await ctx.params;
  if (auth.user.role === "teacher") {
    const test: any = await Test.findOne({
      _id: id,
      teacher: auth.user.id,
    }).lean();
    if (
      !test ||
      !test.assignment ||
      !(await TeacherAssignment.exists({
        _id: test.assignment,
        teacher: auth.user.id,
      }))
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ownedTest: any = await Test.findOne({
    _id: id,
    teacher: auth.user.id,
  }).lean();
  if (
    auth.user.role === "teacher" &&
    (ownedTest?.isPublished || (await Result.exists({ test: id })))
  )
    return NextResponse.json(
      {
        error: "Questions cannot change after publishing or a student attempt",
      },
      { status: 409 },
    );
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { questionNumber, question, options } = body || {};
  if (
    !Number.isInteger(questionNumber) ||
    questionNumber < 1 ||
    typeof question !== "string" ||
    !question.trim() ||
    !Array.isArray(options) ||
    options.length !== 4 ||
    options.some((option) => typeof option !== "string" || !option.trim())
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  let doc: any = await Question.findOne({ testId: id });
  if (!doc) {
    doc = await Question.create({
      testId: id,
      subject: "",
      questions: [],
    } as any);
  }
  const idx = (doc.questions as any[]).findIndex(
    (q: any) => q.questionNumber === questionNumber,
  );
  const payload = {
    questionNumber,
    encryptedQuestion: encryptString(question),
    encryptedOptions: options.map((s: string) => encryptString(s)),
  } as any;
  if (idx >= 0) {
    (doc.questions as any[])[idx] = {
      ...(doc.questions as any[])[idx],
      ...payload,
    };
    delete (doc.questions as any[])[idx].correctAnswerIndex;
  } else {
    (doc.questions as any[]).push(payload);
  }
  (doc.questions as any[]).sort(
    (a: any, b: any) => a.questionNumber - b.questionNumber,
  );
  await doc.save();
  await Test.findByIdAndUpdate(id, {
    $set: { totalQuestions: (doc.questions as any[]).length },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { id } = await ctx.params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { questionNumber } = body || {};
  if (auth.user.role === "teacher") {
    const test: any = await Test.findOne({
      _id: id,
      teacher: auth.user.id,
    }).lean();
    if (
      !test ||
      !test.assignment ||
      !(await TeacherAssignment.exists({
        _id: test.assignment,
        teacher: auth.user.id,
      }))
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (test.isPublished || (await Result.exists({ test: id })))
      return NextResponse.json(
        {
          error:
            "Questions cannot change after publishing or a student attempt",
        },
        { status: 409 },
      );
  }
  const doc: any = await Question.findOne({ testId: id });
  if (!doc) return NextResponse.json({ ok: true });
  doc.questions = (doc.questions as any[]).filter(
    (q: any) => q.questionNumber !== questionNumber,
  );
  await doc.save();
  await Test.findByIdAndUpdate(id, {
    $set: { totalQuestions: (doc.questions as any[]).length },
  });
  return NextResponse.json({ ok: true });
}
