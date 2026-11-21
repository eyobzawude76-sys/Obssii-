"use client";

export default function TeacherAnswersPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-fuchsia-700">
        Answer Review
      </h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        V1 does not use an answer key during question creation. After a student
        submits an exam, open Teacher Results to review each submitted answer
        and mark it Right or Wrong. The system calculates the score from those
        teacher marks.
      </p>
    </div>
  );
}
