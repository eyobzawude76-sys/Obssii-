import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Grade from "@/models/Grade";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import TeacherAssignment from "@/models/TeacherAssignment";
import User from "@/models/User";

export async function GET() {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;

  try {
    await dbConnect();

    const [
      totalTeachers,
      totalStudents,
      totalAdmins,
      totalGrades,
      totalSections,
      totalSubjects,
      totalTeachingAssignments,
    ] = await Promise.all([
      User.countDocuments({ role: "teacher" }),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: { $in: ["admin", "superadmin"] } }),
      Grade.countDocuments({}),
      Section.countDocuments({}),
      Subject.countDocuments({}),
      TeacherAssignment.countDocuments({}),
    ]);

    return NextResponse.json({
      summary: {
        totalTeachers,
        totalStudents,
        totalAdmins,
        totalGrades,
        totalSections,
        totalSubjects,
        totalTeachingAssignments,
      },
    });
  } catch (error) {
    console.error("Admin setup dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch system setup data" },
      { status: 500 },
    );
  }
}
