import { NextResponse } from "next/server";
import { getAuthOrThrow } from "@/lib/with-auth";

// Bulk imports previously accepted caller-selected roles and passwords. Keep the
// route explicit while directing Admins to the validated, one-time credential flow.
export async function GET() {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  return NextResponse.json(
    {
      error:
        "Bulk account import is disabled. Create teacher/student accounts in Admin > Teachers & Students.",
    },
    { status: 410 },
  );
}

export async function POST() {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  if ("error" in auth) return auth.error;
  return NextResponse.json(
    {
      error:
        "Bulk account import is disabled. Create teacher/student accounts in Admin > Teachers & Students.",
    },
    { status: 410 },
  );
}
