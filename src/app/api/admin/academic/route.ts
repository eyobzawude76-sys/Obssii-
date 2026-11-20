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

const gradeInput = z.object({
  level: z.coerce
    .number()
    .int()
    .refine((n) => n === 11 || n === 12),
});
const sectionInput = z.object({
  gradeId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9-]+$/),
});
const subjectInput = z.object({ name: z.string().trim().min(1).max(80) });
const editInput = z.object({
  kind: z.enum(["grade", "section", "subject"]),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  gradeId: z.string().optional(),
  level: z.coerce.number().int().optional(),
});

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const [grades, sections, subjects] = await Promise.all([
    Grade.find({}).sort({ level: 1 }).lean(),
    Section.find({}).populate("grade", "level").sort({ name: 1 }).lean(),
    Subject.find({}).sort({ name: 1 }).lean(),
  ]);
  return NextResponse.json({ grades, sections, subjects });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  await dbConnect();
  try {
    if (body.kind === "grade") {
      const parsed = gradeInput.safeParse(body);
      if (!parsed.success) return badRequest("Grade must be 11 or 12");
      return NextResponse.json(
        await Grade.create({ level: parsed.data.level }),
        { status: 201 },
      );
    }
    if (body.kind === "section") {
      const parsed = sectionInput.safeParse(body);
      if (!parsed.success || !mongoose.isValidObjectId(parsed.data?.gradeId))
        return badRequest("A valid grade and section name are required");
      if (!(await Grade.exists({ _id: parsed.data.gradeId })))
        return badRequest("Grade not found", 404);
      return NextResponse.json(
        await Section.create({
          grade: parsed.data.gradeId,
          name: parsed.data.name,
        }),
        { status: 201 },
      );
    }
    if (body.kind === "subject") {
      const parsed = subjectInput.safeParse(body);
      if (!parsed.success)
        return badRequest("Subject name is required (80 characters max)");
      return NextResponse.json(
        await Subject.create({
          name: parsed.data.name,
          normalizedName: parsed.data.name.toLocaleLowerCase(),
        }),
        { status: 201 },
      );
    }
    return badRequest("kind must be grade, section, or subject");
  } catch (error: any) {
    if (error?.code === 11000)
      return badRequest("That grade, section, or subject already exists", 409);
    return badRequest("Could not create academic record");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = editInput.safeParse(body);
  if (!parsed.success || !mongoose.isValidObjectId(parsed.data?.id))
    return badRequest("Invalid update");
  await dbConnect();
  try {
    const { kind, id } = parsed.data;
    let doc: unknown;
    if (kind === "grade") {
      if (parsed.data.level !== 11 && parsed.data.level !== 12)
        return badRequest("Grade must be 11 or 12");
      doc = await Grade.findByIdAndUpdate(
        id,
        { level: parsed.data.level },
        { new: true, runValidators: true },
      );
    } else if (kind === "section") {
      if (!parsed.data.name || !/^[a-zA-Z0-9-]{1,20}$/.test(parsed.data.name))
        return badRequest("Invalid section name");
      const update: any = { name: parsed.data.name.toUpperCase() };
      if (parsed.data.gradeId) {
        if (
          !mongoose.isValidObjectId(parsed.data.gradeId) ||
          !(await Grade.exists({ _id: parsed.data.gradeId }))
        )
          return badRequest("Grade not found");
        const sectionInUse = await Section.exists({
          _id: id,
          grade: { $ne: parsed.data.gradeId },
        });
        if (
          sectionInUse &&
          ((await User.exists({ section: id })) ||
            (await TeacherAssignment.exists({ section: id })) ||
            (await Test.exists({ section: id })))
        )
          return badRequest(
            "Section is in use by accounts, teacher assignments, or exam history and cannot be moved to another grade",
            409,
          );
        update.grade = parsed.data.gradeId;
      }
      doc = await Section.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });
    } else {
      if (!parsed.data.name?.trim())
        return badRequest("Subject name is required");
      const currentSubject: any = await Subject.findById(id)
        .select("name")
        .lean();
      if (!currentSubject) return badRequest("Record not found", 404);
      if (
        currentSubject.name !== parsed.data.name.trim() &&
        ((await Test.exists({ subject: currentSubject.name })) ||
          (await User.exists({ subjects: currentSubject.name })))
      )
        return badRequest(
          "Subject is already used by tests or teachers and cannot be renamed",
          409,
        );
      doc = await Subject.findByIdAndUpdate(
        id,
        {
          name: parsed.data.name.trim(),
          normalizedName: parsed.data.name.trim().toLocaleLowerCase(),
        },
        { new: true, runValidators: true },
      );
    }
    return doc ? NextResponse.json(doc) : badRequest("Record not found", 404);
  } catch (error: any) {
    if (error?.code === 11000)
      return badRequest("That grade, section, or subject already exists", 409);
    return badRequest("Could not update academic record");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = z
    .object({
      kind: z.enum(["grade", "section", "subject"]),
      id: z.string().min(1),
    })
    .safeParse(body);
  if (!parsed.success || !mongoose.isValidObjectId(parsed.data.id))
    return badRequest("Invalid record");
  await dbConnect();
  const { kind, id } = parsed.data;
  if (kind === "grade") {
    if (
      (await Section.exists({ grade: id })) ||
      (await User.exists({ grade: id })) ||
      (await Test.exists({ grade: id }))
    )
      return badRequest(
        "Grade is in use by sections, accounts, or exam history and cannot be deleted",
        409,
      );
    await Grade.findByIdAndDelete(id);
  } else if (kind === "section") {
    if (
      (await User.exists({ section: id })) ||
      (await TeacherAssignment.exists({ section: id })) ||
      (await Test.exists({ section: id }))
    )
      return badRequest(
        "Section is in use by accounts, teacher assignments, or exam history and cannot be deleted",
        409,
      );
    await Section.findByIdAndDelete(id);
  } else {
    const subject: any = await Subject.findById(id).select("name").lean();
    if (!subject) return NextResponse.json({ success: true });
    if (
      (await TeacherAssignment.exists({ subject: id })) ||
      (await Test.exists({ subject: subject.name })) ||
      (await User.exists({ subjects: subject.name }))
    )
      return badRequest("Subject is in use and cannot be deleted", 409);
    await Subject.findByIdAndDelete(id);
  }
  return NextResponse.json({ success: true });
}
