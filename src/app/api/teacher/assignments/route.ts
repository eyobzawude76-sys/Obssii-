import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import TeacherAssignment from "@/models/TeacherAssignment";

export async function GET() {
  const auth = await getAuthOrThrow("teacher");
  if ("error" in auth) return auth.error;
  await dbConnect();
  const assignments = await TeacherAssignment.find({ teacher: auth.user.id })
    .populate("grade", "level")
    .populate("section", "name")
    .populate("subject", "name")
    .lean();
  return NextResponse.json(assignments);
}
