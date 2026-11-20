import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import TeacherAssignment from "@/models/TeacherAssignment";
import TermsTemplate from "@/models/TermsTemplate";
import Test from "@/models/Test";
import User from "@/models/User";

export async function GET(_req: NextRequest) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  let cond: any = {};
  if (auth.user.role === "teacher") {
    const assignmentIds = await TeacherAssignment.find({
      teacher: auth.user.id,
    }).distinct("_id");
    cond = { teacher: auth.user.id, assignment: { $in: assignmentIds } };
  }
  const tests = await Test.find(cond)
    .select(
      "title subject totalQuestions status createdAt startTime endTime durationMinutes assignment grade section isPublished allowRetake",
    )
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(tests);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthOrThrow(["teacher", "admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  if (auth.user.role !== "teacher")
    return NextResponse.json({ error: "Teachers only" }, { status: 403 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const {
    title,
    assignmentId,
    description,
    durationMinutes,
    startTime,
    endTime,
  } = body || {};
  if (
    typeof title !== "string" ||
    !title.trim() ||
    !mongoose.isValidObjectId(assignmentId)
  )
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const assignment: any = await TeacherAssignment.findOne({
    _id: assignmentId,
    teacher: auth.user.id,
  })
    .populate("grade", "level")
    .populate("section", "name")
    .populate("subject", "name")
    .lean();
  if (!assignment)
    return NextResponse.json(
      { error: "Assignment not found" },
      { status: 403 },
    );
  const minutes = Number(durationMinutes ?? 60);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)
    return NextResponse.json(
      { error: "Duration must be 1 to 600 minutes" },
      { status: 400 },
    );

  // Fetch teacher's terms template
  const termsTemplate = await TermsTemplate.findOne({
    teacher: auth.user.id,
  });

  // Create test with terms snapshot
  const doc = await Test.create({
    title: title.trim(),
    subject: assignment.subject.name,
    description,
    durationMinutes: durationMinutes ?? 60,
    startTime,
    endTime,
    teacher: auth.user.id,
    assignment: assignment._id,
    grade: assignment.grade._id,
    section: assignment.section._id,
    subjectId: assignment.subject._id,
    assignedStudents: await User.find({
      role: "student",
      grade: assignment.grade._id,
      section: assignment.section._id,
    }).distinct("_id"),
    testDate: startTime || new Date(),
    encryptionKey: "derived",
    status: "upcoming",
    termsTemplate: termsTemplate?._id || null,
    termsAndConditions: termsTemplate?.terms || [],
  } as any);
  return NextResponse.json({ id: doc._id }, { status: 201 });
}
