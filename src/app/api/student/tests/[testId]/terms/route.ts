import { NextResponse } from "next/server";
import { getStudentExamAccess } from "@/lib/student-exam-access";
import { getAuthOrThrow } from "@/lib/with-auth";

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

  return NextResponse.json({
    testTitle: access.test.title,
    terms: access.test.termsAndConditions || [],
  });
}
