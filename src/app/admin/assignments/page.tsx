"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { oromoErrorMessage } from "@/lib/oromo-errors";

type TestRow = { id: string; title: string; subject: string };
type StudentRow = { id: string; name: string; email: string };
type RecentAssignment = {
  _id: string;
  title: string;
  assignedStudents: string[];
  testDate?: string;
};

export default function AssignTestsPage() {
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [studentsList, setStudentsList] = useState<StudentRow[]>([]);
  const [recent, setRecent] = useState<RecentAssignment[]>([]);

  const [testId, setTestId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set(),
  );
  const [studentQuery, setStudentQuery] = useState("");
  const [date, setDate] = useState<string>("");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return studentsList;
    return studentsList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [studentsList, studentQuery]);

  const toggleSelect = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      for (const student of filteredStudents) next.add(student.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedStudentIds(new Set());

  const load = useCallback(async () => {
    try {
      const tr = await fetch("/api/teacher/tests");
      const tdata = (await tr.json()) as Array<{
        _id: string;
        title: string;
        subject: string;
      }>;
      if (tr.ok)
        setTests(
          tdata.map((t) => ({
            id: String(t._id),
            title: t.title,
            subject: t.subject,
          })),
        );
      const ur = await fetch("/api/admin/users?role=student");
      const udata = (await ur.json()) as Array<{
        _id: string;
        name: string;
        email: string;
      }>;
      if (ur.ok)
        setStudentsList(
          udata.map((u) => ({
            id: String(u._id),
            name: u.name,
            email: u.email,
          })),
        );
      const ar = await fetch("/api/admin/assignments");
      const adata = (await ar.json()) as RecentAssignment[];
      if (ar.ok) setRecent(adata);
    } catch (error) {
      setStatus(oromoErrorMessage(error, "Daataa qormaataa fi barattootaa fe'uun hin danda'amne."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const students = Array.from(selectedStudentIds);
    if (!testId || students.length === 0 || !date || !start || !end) return;
    setSaving(true);
    setStatus("");
    try {
      const startTime = new Date(`${date}T${start}:00`);
      const endTime = new Date(`${date}T${end}:00`);

      // Validate end time is after start time
      if (endTime <= startTime) {
        setStatus("Yeroon xumuraa yeroon jalqabaa booda ta'uu qaba.");
        setSaving(false);
        return;
      }

      // Calculate duration in minutes
      const durationMinutes = Math.round(
        (endTime.getTime() - startTime.getTime()) / 60000,
      );

      const responses = await Promise.all(
        students.map((sId) =>
          fetch("/api/admin/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              testId,
              studentId: sId,
              testDate: new Date(date),
              startTime,
              endTime,
              durationMinutes,
              status: "assigned",
            }),
          }),
        ),
      );
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const errorData = await failedResponse.json().catch(() => null);
        throw new Error(errorData?.error || "Assignment failed");
      }
      setStatus(`Barattoota ${students.length}f qormaanni ramadameera.`);
      setSelectedStudentIds(new Set());
      await load();
    } catch (error) {
      setStatus(oromoErrorMessage(error, "Qormaata barattootaaf ramaduu hin dandeenye."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl md:text-2xl font-bold tracking-tight">
        Assign Tests
      </h1>

      <form
        onSubmit={submit}
        className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-card border border-border rounded-2xl p-6 shadow-sm"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="assignment-test"
            className="text-sm font-medium text-muted-foreground"
          >
            Select Test
          </label>
          <select
            id="assignment-test"
            required
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-input border border-border focus:ring-2 focus:ring-ring outline-none"
          >
            <option value="" disabled>
              Choose test
            </option>
            {tests.length === 0 ? (
              <option value="" disabled>
                {" "}
                No tests found
              </option>
            ) : (
              tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} — {t.subject}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="assignment-date"
            className="text-sm font-medium text-muted-foreground"
          >
            Test Date
          </label>
          <input
            id="assignment-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg bg-input border border-border focus:ring-2 focus:ring-ring outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="assignment-start"
            className="text-sm font-medium text-muted-foreground"
          >
            Start Time
          </label>
          <input
            id="assignment-start"
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-lg bg-input border border-border focus:ring-2 focus:ring-ring outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="assignment-end"
            className="text-sm font-medium text-muted-foreground"
          >
            End Time
          </label>
          <input
            id="assignment-end"
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 rounded-lg bg-input border border-border focus:ring-2 focus:ring-ring outline-none"
          />
        </div>

        <div className="md:col-span-2 flex items-center justify-between gap-2 pt-2">
          <div className="text-xs text-muted-foreground">{status}</div>
          <Button type="submit" className="font-semibold" disabled={saving}>
            {saving ? (
              <span className="animate-pulse">Assigning…</span>
            ) : (
              "Assign"
            )}
          </Button>
        </div>
      </form>

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-medium">Select Students</div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              className="w-full min-w-0 flex-1 basis-full rounded-lg border border-border bg-input px-3 py-2 sm:basis-auto"
              placeholder="Search by name or email"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={selectAllFiltered}>
              Select All
            </Button>
            <Button size="sm" variant="secondary" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="text-left px-3 py-2">Pick</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Email</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    No students
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2">{s.email}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <div className="mb-2 font-medium text-foreground">
          Recent Assignments
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {recent.length === 0 ? (
            <Skeleton className="h-16" />
          ) : (
            recent.slice(0, 6).map((a) => (
              <div
                key={a._id}
                className="border border-border rounded-lg p-3 bg-background text-foreground"
              >
                <div className="text-sm font-medium">
                  Test: {String(a.title)}
                </div>
                <div className="text-xs">
                  Students: {String(a.assignedStudents.length)}
                </div>
                <div className="text-xs">
                  Date:{" "}
                  {a.testDate ? new Date(a.testDate).toLocaleDateString() : "-"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
