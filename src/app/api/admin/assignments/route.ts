import { NextResponse } from "next/server";
import { getAuthOrThrow } from "@/lib/with-auth";

function unavailable() {
  return NextResponse.json(
    {
      error:
        "Admin test assignment is not part of V1. Teachers publish exams to their assigned classes and sections.",
    },
    { status: 410 },
  );
}

async function authorizeAdmin() {
  const auth = await getAuthOrThrow(["admin", "superadmin"]);
  return "error" in auth ? auth.error : null;
}

export async function GET() {
  const error = await authorizeAdmin();
  if (error) return error;
  return unavailable();
}

export async function POST() {
  const error = await authorizeAdmin();
  if (error) return error;
  return unavailable();
}

export async function PATCH() {
  const error = await authorizeAdmin();
  if (error) return error;
  return unavailable();
}

export async function DELETE() {
  const error = await authorizeAdmin();
  if (error) return error;
  return unavailable();
}
