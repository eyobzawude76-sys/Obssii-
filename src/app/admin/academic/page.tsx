"use client";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { oromoErrorMessage } from "@/lib/oromo-errors";

type Item = { _id: string; level?: number; name?: string; grade?: any };

export default function AdminAcademicPage() {
  const [grades, setGrades] = useState<Item[]>([]);
  const [sections, setSections] = useState<Item[]>([]);
  const [subjects, setSubjects] = useState<Item[]>([]);
  const [level, setLevel] = useState("11");
  const [gradeId, setGradeId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/academic");
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "Could not load academic structure");
    setGrades(data.grades);
    setSections(data.sections);
    setSubjects(data.subjects);
    if (data.grades.length)
      setGradeId((current) => current || String(data.grades[0]._id));
  }, []);
  useEffect(() => {
    load().catch((e) => setMessage(oromoErrorMessage(e, "Caasaalee barnootaa fe'uun hin danda'amne.")));
  }, [load]);

  const create = async (
    kind: "grade" | "section" | "subject",
    e: FormEvent,
  ) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const body =
      kind === "grade"
        ? { kind, level: Number(level) }
        : kind === "section"
          ? { kind, gradeId, name: sectionName }
          : { kind, name: subjectName };
    try {
      const res = await fetch("/api/admin/academic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create record");
      setMessage("Academic record created.");
      if (kind === "section") setSectionName("");
      if (kind === "subject") setSubjectName("");
      await load();
    } catch (e: any) {
      setMessage(oromoErrorMessage(e, "Odeeffannoo barnootaa uumuu hin dandeenye. Galmee galchite mirkaneeffadhu."));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (kind: "grade" | "section" | "subject", item: Item) => {
    const current = kind === "grade" ? String(item.level) : item.name || "";
    const value = window.prompt(
      kind === "grade"
        ? "Update grade level (11 or 12)"
        : `Update ${kind} name`,
      current,
    );
    if (!value || value.trim() === current) return;
    const body =
      kind === "grade"
        ? { kind, id: item._id, level: Number(value) }
        : { kind, id: item._id, name: value.trim() };
    const res = await fetch("/api/admin/academic", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMessage(
      res.ok ? `${kind} updated.` : oromoErrorMessage(data.error, "Odeeffannoo barnootaa haaromsuu hin dandeenye."),
    );
    if (res.ok) await load();
  };

  const remove = async (kind: "grade" | "section" | "subject", item: Item) => {
    if (
      !window.confirm(
        `Delete ${kind === "grade" ? `Grade ${item.level}` : item.name}?`,
      )
    )
      return;
    const res = await fetch("/api/admin/academic", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id: item._id }),
    });
    const data = await res.json();
    setMessage(
      res.ok ? `${kind} deleted.` : oromoErrorMessage(data.error, "Odeeffannoo barnootaa haquu hin dandeenye."),
    );
    if (res.ok) await load();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Academic Structure</h1>
        <p className="text-sm text-muted-foreground">
          Manage Grade 11 and 12, their sections, and the subject catalog.
        </p>
      </div>
      {message && (
        <output className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {message}
        </output>
      )}
      <div className="grid min-w-0 gap-5 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Grades</h2>
          <form
            onSubmit={(e) => create("grade", e)}
            className="mb-4 flex gap-2"
          >
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2"
            >
              <option value="11">Grade 11</option>
              <option value="12">Grade 12</option>
            </select>
            <Button disabled={busy}>Add</Button>
          </form>
          <ul className="space-y-2">
            {grades.map((g) => (
              <li
                key={g._id}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
              >
                <span>Grade {g.level}</span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => rename("grade", g)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => remove("grade", g)}
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Sections</h2>
          <form
            onSubmit={(e) => create("section", e)}
            className="mb-4 flex flex-col gap-2"
          >
            <select
              required
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              className="rounded-lg border border-border bg-input px-3 py-2"
            >
              <option value="">Choose grade</option>
              {grades.map((g) => (
                <option key={g._id} value={g._id}>
                  Grade {g.level}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                required
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="e.g. 11-A or A"
                className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2"
              />
              <Button disabled={busy || !gradeId}>Add</Button>
            </div>
          </form>
          <ul className="space-y-2">
            {sections.map((s) => (
              <li
                key={s._id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
              >
                <span>
                  Grade {s.grade?.level}: {s.name}
                </span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => rename("section", s)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => remove("section", s)}
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Subjects</h2>
          <form
            onSubmit={(e) => create("subject", e)}
            className="mb-4 flex gap-2"
          >
            <input
              required
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Subject name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2"
            />
            <Button disabled={busy}>Add</Button>
          </form>
          <ul className="space-y-2">
            {subjects.map((s) => (
              <li
                key={s._id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
              >
                <span>{s.name}</span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => rename("subject", s)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => remove("subject", s)}
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
