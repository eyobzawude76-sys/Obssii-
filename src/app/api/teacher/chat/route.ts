import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "AI Assistant is not part of SmartExam Ethiopia V1." },
    { status: 404 },
  );
}
