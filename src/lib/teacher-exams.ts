import Result from "@/models/Result";

export type ExamTiming = {
  _id: unknown;
  durationMinutes?: number;
  endTime?: Date | string | null;
};

export type AnswerRecord = {
  questionNumber: number;
  chosenOption?: number;
  isCorrect?: boolean;
};

export type QuestionRecord = {
  questionNumber: number;
};

export type QuestionSet = { questions?: QuestionRecord[] } | null;

export type AttemptRecord = {
  testCompleted?: boolean;
  startedAt?: Date | string | null;
  answers?: AnswerRecord[];
  totalQuestions?: number;
  correctAnswers?: number;
  percentage?: number;
  autoSubmitted?: boolean;
  submittedAt?: Date;
  save: () => Promise<unknown>;
};

type AttemptTiming = {
  startedAt?: Date | string | null;
  testCompleted?: boolean;
};

export function getAttemptDeadline(attempt: AttemptTiming, test: ExamTiming) {
  if (!attempt.startedAt) return null;
  const durationDeadline =
    new Date(attempt.startedAt).getTime() +
    Number(test.durationMinutes || 60) * 60_000;
  return test.endTime
    ? Math.min(durationDeadline, new Date(test.endTime).getTime())
    : durationDeadline;
}

export async function finalizeAttemptIfExpired(
  result: AttemptRecord | null,
  test: ExamTiming,
  now = Date.now(),
  providedQuestions?: QuestionSet,
) {
  if (!result || result.testCompleted) return false;
  const deadline = getAttemptDeadline(result, test);
  if (deadline === null || now < deadline) return false;

  const answers = result.answers || [];
  for (const answer of answers) {
    answer.isCorrect = undefined;
  }

  result.answers = answers;
  result.correctAnswers = 0;
  result.percentage = 0;
  result.testCompleted = true;
  result.autoSubmitted = true;
  result.submittedAt = new Date(deadline);
  await result.save();
  return true;
}

export async function finalizeExpiredAttempt(
  test: ExamTiming,
  studentId: string,
) {
  const result = (await Result.findOne({
    student: studentId,
    test: test._id,
    testCompleted: false,
  }).sort({ attemptNumber: -1 })) as unknown as AttemptRecord | null;
  if (result && !result.startedAt) {
    result.startedAt = new Date();
    await result.save();
    return false;
  }
  return finalizeAttemptIfExpired(result, test);
}
