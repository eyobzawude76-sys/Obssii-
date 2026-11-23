"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { oromoErrorMessage } from "@/lib/oromo-errors";

type Assignment = {
  _id: string;
  grade: { level: number };
  section: { name: string };
  subject: { name: string };
};
type TestRow = {
  id: string;
  title: string;
  subject: string;
  totalQuestions: number;
  isPublished: boolean;
  allowRetake: boolean;
};

export default function TeacherTestsPage() {
  const [tests, setTests] = useState<TestRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [creating, setCreating] = useState(false);
  const [pageError, setPageError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");
      const response = await fetch("/api/teacher/tests?mine=1");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load exams");
      setTests(
        data.map((item: any) => ({
          id: String(item._id),
          title: item.title,
          subject: item.subject,
          totalQuestions: item.totalQuestions || 0,
          isPublished: !!item.isPublished,
          allowRetake: !!item.allowRetake,
        })),
      );
    } catch (error) {
      setTests([]);
      setPageError(oromoErrorMessage(error, "Qormaata barsiisaa fe'uun hin danda'amne."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/teacher/assignments")
      .then((response) => response.json())
      .then((data) => setAssignments(Array.isArray(data) ? data : []))
      .catch(() => setAssignments([]));
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetch("/api/teacher/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, assignmentId, durationMinutes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed");
      setTitle("");
      setAssignmentId("");
      setDurationMinutes(60);
      await load();
    } catch (error) {
      alert(oromoErrorMessage(error, "Qormaata uumuu hin dandeenye. Maaloo odeeffannoo galchite mirkaneeffadhu."));
    } finally {
      setCreating(false);
    }
  };

  const update = async (id: string, values: object) => {
    const response = await fetch(`/api/teacher/tests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(oromoErrorMessage(data.error, "Qormaata haaromsuu ykn maxxansuu hin dandeenye."));
      return;
    }
    await load();
  };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl md:text-2xl font-bold tracking-tight text-blue-700">
        My Exams
      </h1>
      {pageError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
      <form
        onSubmit={create}
        className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-card border border-border rounded-xl p-4 shadow"
      >
        <input
          required
          placeholder="Exam title"
          className="px-3 py-2 rounded-lg bg-input border border-border"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <select
          required
          className="px-3 py-2 rounded-lg bg-input border border-border"
          value={assignmentId}
          onChange={(event) => setAssignmentId(event.target.value)}
        >
          <option value="">Choose assigned class and subject</option>
          {assignments.map((item) => (
            <option key={item._id} value={item._id}>
              Grade {item.grade.level} {item.section.name} · {item.subject.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          Duration (minutes)
          <input
            type="number"
            required
            min={1}
            max={600}
            className="w-24 px-3 py-2 rounded-lg bg-input border border-border"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          />
        </label>
        <Button type="submit" disabled={creating || assignments.length === 0}>
          {creating ? "Creating..." : "Create Draft Exam"}
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Subject</th>
              <th className="text-left px-4 py-3">Questions</th>
              <th className="text-left px-4 py-3">Availability</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8">
                  <Skeleton className="w-full h-10" />
                </td>
              </tr>
            ) : tests.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No exams yet
                </td>
              </tr>
            ) : (
              tests.map((test) => (
                <tr key={test.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{test.title}</td>
                  <td className="px-4 py-3">{test.subject}</td>
                  <td className="px-4 py-3">{test.totalQuestions}</td>
                  <td className="px-4 py-3">
                    {test.isPublished ? "Published" : "Draft"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" asChild>
                        <a href={`/teacher/tests/details?test=${test.id}`}>
                          Edit MCQs
                        </a>
                      </Button>
                      <Button size="sm" variant="secondary" asChild>
                        <a href={`/teacher/questions?test=${test.id}`}>
                          Upload CSV
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          update(test.id, { isPublished: !test.isPublished })
                        }
                      >
                        {test.isPublished ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          update(test.id, { allowRetake: !test.allowRetake })
                        }
                      >
                        {test.allowRetake ? "Disable retake" : "Allow retake"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
