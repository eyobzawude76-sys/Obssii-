import { type NextRequest, NextResponse } from "next/server";
import {
  validateCreateAssignment,
  validateDateRange,
  validateRemoveAssignment,
  validateUpdateAssignment,
} from "@/lib/admin-assignment-validation";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Test from "@/models/Test";
import User from "@/models/User";

async function readJson(req: NextRequest): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function validationFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ValidationError" || error.name === "CastError")
  );
}

export async function GET() {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();
  // Recent assigned tests (any test with assignedStudents)
  const tests = await Test.find({
    assignedStudents: { $exists: true, $ne: [] },
  })
    .select(
      "title subject assignedStudents testDate startTime endTime updatedAt",
    )
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
  return NextResponse.json(tests);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();

  const parsed = validateCreateAssignment(await readJson(req));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [test, student] = await Promise.all([
    Test.findById(parsed.value.testId).select("_id"),
    User.findOne({ _id: parsed.value.studentId, role: "student" }).select(
      "_id",
    ),
  ]);
  if (!test)
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  if (!student)
    return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const set: Record<string, unknown> = {
    testDate: parsed.value.testDate,
    startTime: parsed.value.startTime,
    endTime: parsed.value.endTime,
    updatedAt: new Date(),
  };
  if (parsed.value.durationMinutes !== undefined) {
    set.durationMinutes = parsed.value.durationMinutes;
  }
  if (parsed.value.status !== undefined) set.status = parsed.value.status;

  try {
    const doc = await Test.findByIdAndUpdate(
      parsed.value.testId,
      { $addToSet: { assignedStudents: parsed.value.studentId }, $set: set },
      { new: true, runValidators: true, context: "query" },
    );
    if (!doc)
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: doc._id });
  } catch (error) {
    if (validationFailure(error)) {
      return NextResponse.json(
        { error: "Assignment values are invalid" },
        { status: 400 },
      );
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();

  const parsed = validateUpdateAssignment(await readJson(req));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const test = await Test.findById(parsed.value.testId).select(
    "startTime endTime",
  );
  if (!test)
    return NextResponse.json({ error: "Test not found" }, { status: 404 });

  const startTime = parsed.value.updates.startTime ?? test.startTime;
  const endTime = parsed.value.updates.endTime ?? test.endTime;
  if (!validateDateRange(startTime, endTime)) {
    return NextResponse.json(
      { error: "endTime must be after startTime" },
      { status: 400 },
    );
  }

  if (parsed.value.updates.assignedStudents) {
    const studentCount = await User.countDocuments({
      _id: { $in: parsed.value.updates.assignedStudents },
      role: "student",
    });
    if (studentCount !== parsed.value.updates.assignedStudents.length) {
      return NextResponse.json(
        { error: "All assignedStudents must reference existing students" },
        { status: 400 },
      );
    }
  }

  try {
    const doc = await Test.findByIdAndUpdate(
      parsed.value.testId,
      { $set: { ...parsed.value.updates, updatedAt: new Date() } },
      { new: true, runValidators: true, context: "query" },
    );
    if (!doc)
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: doc._id });
  } catch (error) {
    if (validationFailure(error)) {
      return NextResponse.json(
        { error: "Assignment values are invalid" },
        { status: 400 },
      );
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  await dbConnect();

  const parsed = validateRemoveAssignment(await readJson(req));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const test = await Test.findById(parsed.value.testId).select("_id");
  if (!test)
    return NextResponse.json({ error: "Test not found" }, { status: 404 });

  try {
    const doc = await Test.findByIdAndUpdate(
      parsed.value.testId,
      {
        $pull: { assignedStudents: parsed.value.studentId },
        $set: { updatedAt: new Date() },
      },
      { new: true, runValidators: true, context: "query" },
    );
    if (!doc)
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: doc._id });
  } catch (error) {
    if (validationFailure(error)) {
      return NextResponse.json(
        { error: "Assignment values are invalid" },
        { status: 400 },
      );
    }
    throw error;
  }
}
