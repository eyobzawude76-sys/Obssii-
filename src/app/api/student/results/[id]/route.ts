import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Result from "@/models/Result";
import Test from "@/models/Test";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthOrThrow("student");
  if ("error" in auth) return auth.error;
  await dbConnect();
  const { id } = await ctx.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res: any = await Result.findOne({
    _id: id,
    student: auth.user.id,
    published: true,
    finalized: true,
  }).lean();
  if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const test = await Test.findById(res.test)
    .select("title subject durationMinutes testDate startTime endTime")
    .lean();

  return NextResponse.json({ result: res, test });
}
