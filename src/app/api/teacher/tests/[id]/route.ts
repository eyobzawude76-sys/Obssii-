import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Question from "@/models/Question";
import Result from "@/models/Result";
import TeacherAssignment from "@/models/TeacherAssignment";
import Test from "@/models/Test";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { id } = await params;
  if (auth.user.role !== "teacher")
    return NextResponse.json({ error: "Teachers only" }, { status: 403 });
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const doc = await Test.findOne({ _id: id, teacher: auth.user.id });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !(doc as any).assignment ||
    !(await TeacherAssignment.exists({
      _id: (doc as any).assignment,
      teacher: auth.user.id,
    }))
  )
    return NextResponse.json(
      { error: "Assignment access denied" },
      { status: 403 },
    );
  if (typeof body?.isPublished === "boolean") {
    if (!body.isPublished && (await Result.exists({ test: id })))
      return NextResponse.json(
        { error: "An exam with attempts cannot be unpublished" },
        { status: 409 },
      );
    if (body.isPublished) {
      const questionDoc: any = await Question.findOne({ testId: id }).lean();
      if (!questionDoc?.questions?.length)
        return NextResponse.json(
          { error: "Add questions before publishing" },
          { status: 400 },
        );
    }
    doc.isPublished = body.isPublished;
  }
  if (typeof body?.allowRetake === "boolean")
    doc.allowRetake = body.allowRetake;
  if (
    Number.isInteger(body?.durationMinutes) &&
    body.durationMinutes > 0 &&
    body.durationMinutes <= 600
  )
    doc.durationMinutes = body.durationMinutes;
  if (typeof body?.title === "string" && body.title.trim())
    doc.title = body.title.trim();
  if (body?.startTime !== undefined)
    doc.startTime = body.startTime ? new Date(body.startTime) : undefined;
  if (body?.endTime !== undefined)
    doc.endTime = body.endTime ? new Date(body.endTime) : undefined;
  await doc.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { id } = await params;
  if (auth.user.role !== "teacher")
    return NextResponse.json({ error: "Teachers only" }, { status: 403 });
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cond: any = { _id: id, teacher: auth.user.id };
  const test = await Test.findOne(cond).select("assignment").lean();
  if (
    !test ||
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
  const hasResults = await Result.exists({ test: id });
  if (hasResults)
    return NextResponse.json(
      { error: "Tests with submissions cannot be deleted" },
      { status: 409 },
    );
  const doc = await Test.findOneAndDelete(cond);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
