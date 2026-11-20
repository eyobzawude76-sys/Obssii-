import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose-connect";
import { getCronSecret } from "@/lib/security-config";
import {
  type AttemptRecord,
  type ExamTiming,
  finalizeAttemptIfExpired,
  type QuestionSet,
} from "@/lib/teacher-exams";
import Question from "@/models/Question";
import Result from "@/models/Result";
import Test from "@/models/Test";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 250;

function hasValidCronSecret(request: Request, expected: string) {
  const authorization = request.headers.get("authorization") || "";
  if (!expected || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const configured = Buffer.from(expected);
  return (
    supplied.length === configured.length &&
    timingSafeEqual(supplied, configured)
  );
}

export async function GET(request: Request) {
  let expected: string | null;
  try {
    expected = getCronSecret();
  } catch {
    expected = null;
  }
  if (!expected)
    return NextResponse.json(
      { error: "Cron authentication is not configured" },
      { status: 503 },
    );
  if (!hasValidCronSecret(request, expected))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const now = Date.now();
  const due = await Result.aggregate([
    { $match: { testCompleted: false, startedAt: { $type: "date" } } },
    {
      $lookup: {
        from: Test.collection.name,
        localField: "test",
        foreignField: "_id",
        as: "exam",
      },
    },
    { $unwind: "$exam" },
    {
      $addFields: {
        expirationAt: {
          $let: {
            vars: {
              durationDeadline: {
                $add: [
                  "$startedAt",
                  {
                    $multiply: [
                      { $ifNull: ["$exam.durationMinutes", 60] },
                      60_000,
                    ],
                  },
                ],
              },
            },
            in: {
              $cond: [
                { $ne: [{ $ifNull: ["$exam.endTime", null] }, null] },
                { $min: ["$$durationDeadline", "$exam.endTime"] },
                "$$durationDeadline",
              ],
            },
          },
        },
      },
    },
    { $match: { expirationAt: { $lte: new Date(now) } } },
    { $sort: { expirationAt: 1 } },
    { $limit: BATCH_SIZE },
    { $project: { _id: 1 } },
  ]);
  const attempts = await Result.find({
    _id: { $in: due.map((item: { _id: unknown }) => item._id) },
  }).populate("test", "durationMinutes endTime");

  type ExpirableAttempt = AttemptRecord & { test?: ExamTiming | null };
  const questionDocs = new Map<string, QuestionSet>();
  let finalized = 0;
  for (const attempt of attempts as unknown as ExpirableAttempt[]) {
    const test = attempt.test;
    if (!test) continue;
    const testId = String(test._id);
    if (!questionDocs.has(testId)) {
      questionDocs.set(
        testId,
        (await Question.findOne({
          testId: test._id,
        }).lean()) as unknown as QuestionSet,
      );
    }
    if (
      await finalizeAttemptIfExpired(
        attempt,
        test,
        now,
        questionDocs.get(testId),
      )
    ) {
      finalized += 1;
    }
  }

  return NextResponse.json({ scanned: attempts.length, finalized });
}
