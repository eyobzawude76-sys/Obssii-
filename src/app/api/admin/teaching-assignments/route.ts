import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Grade from "@/models/Grade";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import TeacherAssignment from "@/models/TeacherAssignment";
import Test from "@/models/Test";
import User from "@/models/User";

const assignmentInput = z.object({
  teacherId: z.string(),
  gradeId: z.string(),
  sectionId: z.string(),
  subjectId: z.string(),
});

export async function GET() {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const assignments = await TeacherAssignment.find({})
    .populate("teacher", "name username email")
    .populate("grade", "level")
    .populate("section", "name")
    .populate("subject", "name")
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = assignmentInput.safeParse(body);
  if (
    !parsed.success ||
    Object.values(parsed.data || {}).some((id) => !mongoose.isValidObjectId(id))
  ) {
    return NextResponse.json(
      { error: "Valid teacher, grade, section and subject are required" },
      { status: 400 },
    );
  }
  await dbConnect();
  const { teacherId, gradeId, sectionId, subjectId } = parsed.data;
  const [teacher, grade, section, subject] = await Promise.all([
    User.exists({ _id: teacherId, role: "teacher" }),
    Grade.exists({ _id: gradeId }),
    Section.exists({ _id: sectionId, grade: gradeId }),
    Subject.exists({ _id: subjectId }),
  ]);
  if (!teacher)
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!grade || !section || !subject)
    return NextResponse.json(
      { error: "Grade, matching section, or subject not found" },
      { status: 400 },
    );
  try {
    const assignment = await TeacherAssignment.create({
      teacher: teacherId,
      grade: gradeId,
      section: sectionId,
      subject: subjectId,
    });
    return NextResponse.json({ id: assignment.id }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000)
      return NextResponse.json(
        { error: "This teacher already has that assignment" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: "Could not create assignment" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = z.object({ id: z.string() }).safeParse(body);
  if (!parsed.success || !mongoose.isValidObjectId(parsed.data?.id))
    return NextResponse.json(
      { error: "Valid assignment id is required" },
      { status: 400 },
    );
  await dbConnect();
  const assignment = await TeacherAssignment.findById(parsed.data.id).lean();
  if (!assignment)
    return NextResponse.json({ success: false });

  const linkedTest = await Test.exists({
    $or: [
      { assignment: assignment._id },
      {
        teacher: assignment.teacher,
        grade: assignment.grade,
        section: assignment.section,
        subjectId: assignment.subject,
      },
    ],
  });
  if (linkedTest)
    return NextResponse.json(
      {
        error:
          "This assignment is linked to an exam. Keep it to preserve exam and result history.",
      },
      { status: 409 },
    );

  const deleted = await TeacherAssignment.findByIdAndDelete(parsed.data.id);
  return NextResponse.json({ success: !!deleted });
}
