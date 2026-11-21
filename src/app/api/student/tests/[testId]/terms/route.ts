import { NextResponse } from "next/server";
import { getStudentExamAccess } from "@/lib/student-exam-access";
import { getAuthOrThrow } from "@/lib/with-auth";
import User from "@/models/User";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ testId: string }> },
) {
  const auth = await getAuthOrThrow("student");
  if ("error" in auth) return auth.error;

  const { testId } = await ctx.params;
  const access = await getStudentExamAccess(auth.user.id, testId);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const student = await User.findById(auth.user.id)
    .select("name grade section")
    .populate("grade", "level")
    .populate("section", "name")
    .lean();

  return NextResponse.json({
    student,
    testTitle: access.test.title,
    terms: access.test.termsAndConditions || [],
  });
}
