import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Grade from "@/models/Grade";
import Section from "@/models/Section";
import User from "@/models/User";

const accountRoles = ["teacher", "student"] as const;
const safeFields =
  "name email username role studentId grade section isActive dateJoined";
const createInput = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  role: z.enum(accountRoles),
  username: z
    .string()
    .trim()
    .max(64)
    .regex(/^VERIFY-ADMIN-[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .optional(),
  gradeId: z.string().optional(),
  sectionId: z.string().optional(),
});

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function makeUsername(role: "teacher" | "student") {
  return `${role}-${randomBytes(5).toString("hex")}`;
}

function makeTemporaryPassword() {
  return randomBytes(12).toString("base64url");
}

async function validateEnrollment(gradeId?: string, sectionId?: string) {
  if (
    !gradeId ||
    !sectionId ||
    !mongoose.isValidObjectId(gradeId) ||
    !mongoose.isValidObjectId(sectionId)
  )
    return false;
  const [grade, section] = await Promise.all([
    Grade.exists({ _id: gradeId }),
    Section.exists({ _id: sectionId, grade: gradeId }),
  ]);
  return !!grade && !!section;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  const role = req.nextUrl.searchParams.get("role");
  if (role && !accountRoles.includes(role as (typeof accountRoles)[number]))
    return errorResponse("Role must be teacher or student");
  const query = role ? { role } : { role: { $in: accountRoles } };
  const users = await User.find(query)
    .select(safeFields)
    .populate("grade", "level")
    .populate("section", "name")
    .sort({ name: 1 })
    .lean();
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const parsed = createInput.safeParse(body);
  if (!parsed.success)
    return errorResponse(
      "Name, valid email, and teacher/student role are required",
    );
  const {
    name,
    email,
    role,
    gradeId,
    sectionId,
    username: requestedUsername,
  } = parsed.data;
  if (role === "student" && !(await validateEnrollment(gradeId, sectionId)))
    return errorResponse(
      "Students require a valid Grade 11/12 and section from that grade",
    );
  await dbConnect();
  const username = requestedUsername
    ? requestedUsername.toLowerCase()
    : makeUsername(role);
  const temporaryPassword = makeTemporaryPassword();
  try {
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      username,
      role,
      ...(role === "student" ? { grade: gradeId, section: sectionId } : {}),
      password: await hashPassword(temporaryPassword),
      isActive: true,
      createdBy: auth.user.id,
    });
    return NextResponse.json(
      {
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          isActive: user.isActive,
        },
        credentials: { username, temporaryPassword },
      },
      { status: 201 },
    );
  } catch (error: any) {
    if (error?.code === 11000)
      return errorResponse("A user with that email already exists", 409);
    return errorResponse("Could not create account", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const schema = z
    .object({
      id: z.string(),
      name: z.string().trim().min(2).max(100).optional(),
      email: z.string().trim().email().max(254).optional(),
      isActive: z.boolean().optional(),
      gradeId: z.string().optional(),
      sectionId: z.string().optional(),
    })
    .strict();
  const parsed = schema.safeParse(body);
  if (!parsed.success || !mongoose.isValidObjectId(parsed.data?.id))
    return errorResponse("Invalid account update");
  await dbConnect();
  const current = await User.findById(parsed.data.id).select("role");
  if (!current || !accountRoles.includes(current.role))
    return errorResponse("Account not found", 404);
  const { id, gradeId, sectionId, ...fields } = parsed.data;
  const update: Record<string, unknown> = { ...fields };
  if (typeof fields.isActive === "boolean") {
    update.suspendedAt = fields.isActive ? null : new Date();
    update.suspendedBy = fields.isActive ? null : auth.user.id;
  }
  if (typeof fields.email === "string")
    update.email = fields.email.toLowerCase();
  if (
    current.role === "student" &&
    (gradeId !== undefined || sectionId !== undefined)
  ) {
    const existing: any = await User.findById(id)
      .select("grade section")
      .lean();
    const targetGrade = gradeId ?? String(existing?.grade ?? "");
    const targetSection = sectionId ?? String(existing?.section ?? "");
    if (!(await validateEnrollment(targetGrade, targetSection)))
      return errorResponse("Student grade and section must be valid and match");
    update.grade = targetGrade;
    update.section = targetSection;
  } else if (
    current.role === "teacher" &&
    (gradeId !== undefined || sectionId !== undefined)
  ) {
    return errorResponse("Teacher enrollment is managed through assignments");
  }
  try {
    const user = await User.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true },
    )
      .select(safeFields)
      .populate("grade", "level")
      .populate("section", "name")
      .lean();
    return user
      ? NextResponse.json(user)
      : errorResponse("Account not found", 404);
  } catch (error: any) {
    if (error?.code === 11000)
      return errorResponse("Email is already in use", 409);
    return errorResponse("Could not update account", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const parsed = z.object({ id: z.string() }).safeParse(body);
  if (!parsed.success || !mongoose.isValidObjectId(parsed.data?.id))
    return errorResponse("Valid account id is required");
  await dbConnect();
  const user = await User.findOneAndUpdate(
    { _id: parsed.data.id, role: { $in: accountRoles } },
    {
      $set: {
        isActive: false,
        suspendedAt: new Date(),
        suspendedBy: auth.user.id,
      },
    },
    { new: true },
  ).select("_id isActive");
  return NextResponse.json({
    success: !!user,
    deactivated: !!user,
  });
}
