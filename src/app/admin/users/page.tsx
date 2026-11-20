"use client";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: "teacher" | "student";
  isActive: boolean;
  grade?: any;
  section?: any;
};
type Option = { _id: string; name?: string; level?: number; grade?: any };
type Assignment = {
  _id: string;
  teacher: any;
  grade: any;
  section: any;
  subject: any;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Row[]>([]);
  const [grades, setGrades] = useState<Option[]>([]);
  const [sections, setSections] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [credentials, setCredentials] = useState<{
    username: string;
    temporaryPassword: string;
  } | null>(null);
  const [editingStudent, setEditingStudent] = useState<Row | null>(null);
  const [editGradeId, setEditGradeId] = useState("");
  const [editSectionId, setEditSectionId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [u, a, t] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/academic"),
      fetch("/api/admin/teaching-assignments"),
    ]);
    const [userData, academicData, assignmentData] = await Promise.all([
      u.json(),
      a.json(),
      t.json(),
    ]);
    if (u.ok) setUsers(userData.map((x: any) => ({ ...x, id: String(x._id) })));
    if (a.ok) {
      setGrades(academicData.grades);
      setSections(academicData.sections);
      setSubjects(academicData.subjects);
    }
    if (t.ok) setAssignments(assignmentData);
  }, []);
  useEffect(() => {
    load().catch(() => setMessage("Could not load Admin data."));
  }, [load]);

  const availableSections = sections.filter(
    (s) => String(s.grade?._id ?? s.grade) === gradeId,
  );
  const teachers = users.filter((u) => u.role === "teacher");
  const filtered = useMemo(
    () =>
      users.filter((u) =>
        `${u.name} ${u.email} ${u.username} ${u.role}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [users, query],
  );

  const createAccount = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setCredentials(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          ...(role === "student" ? { gradeId, sectionId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Account creation failed");
      setCredentials(data.credentials);
      setMessage(
        "Account created. Save these credentials now; the temporary password is shown only once.",
      );
      setName("");
      setEmail("");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Account creation failed");
    } finally {
      setBusy(false);
    }
  };

  const createAssignment = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/teaching-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, gradeId, sectionId, subjectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assignment failed");
      setMessage("Teacher assignment created.");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Assignment failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (user: Row) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, isActive: !user.isActive }),
    });
    if (res.ok) await load();
    else setMessage((await res.json()).error || "Could not update account");
  };
  const removeAssignment = async (id: string) => {
    const res = await fetch("/api/admin/teaching-assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await load();
    else setMessage("Could not remove assignment");
  };
  const saveEnrollment = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingStudent.id,
        gradeId: editGradeId,
        sectionId: editSectionId,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage("Student enrollment updated.");
      setEditingStudent(null);
      await load();
    } else setMessage(data.error || "Could not update enrollment");
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Teachers & Students</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage accounts, enroll students, and assign teachers.
        </p>
      </div>
      {message && (
        <output className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {message}
        </output>
      )}
      {credentials && (
        <section className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-950">
          <h2 className="font-semibold">Temporary credentials — copy now</h2>
          <p>
            Username: <strong>{credentials.username}</strong>
          </p>
          <p>
            Temporary password:{" "}
            <strong className="select-all">
              {credentials.temporaryPassword}
            </strong>
          </p>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Create account</h2>
        <form onSubmit={createAccount} className="grid gap-3 md:grid-cols-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="rounded-lg border border-border bg-input px-3 py-2"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="rounded-lg border border-border bg-input px-3 py-2"
          />
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as any);
              setGradeId("");
              setSectionId("");
            }}
            className="rounded-lg border border-border bg-input px-3 py-2"
          >
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
          {role === "student" && (
            <>
              <select
                required
                value={gradeId}
                onChange={(e) => {
                  setGradeId(e.target.value);
                  setSectionId("");
                }}
                className="rounded-lg border border-border bg-input px-3 py-2"
              >
                <option value="">Select grade</option>
                {grades.map((g) => (
                  <option key={g._id} value={g._id}>
                    Grade {g.level}
                  </option>
                ))}
              </select>
              <select
                required
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="rounded-lg border border-border bg-input px-3 py-2"
              >
                <option value="">Select section</option>
                {availableSections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "Creating…" : `Create ${role}`}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">
          Assign teacher to class and subject
        </h2>
        <form onSubmit={createAssignment} className="grid gap-3 md:grid-cols-5">
          <select
            required
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="rounded-lg border border-border bg-input px-3 py-2"
          >
            <option value="">Teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            required
            value={gradeId}
            onChange={(e) => {
              setGradeId(e.target.value);
              setSectionId("");
            }}
            className="rounded-lg border border-border bg-input px-3 py-2"
          >
            <option value="">Grade</option>
            {grades.map((g) => (
              <option key={g._id} value={g._id}>
                Grade {g.level}
              </option>
            ))}
          </select>
          <select
            required
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="rounded-lg border border-border bg-input px-3 py-2"
          >
            <option value="">Section</option>
            {availableSections.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            required
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="rounded-lg border border-border bg-input px-3 py-2"
          >
            <option value="">Subject</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button disabled={busy || teachers.length === 0} type="submit">
            Assign
          </Button>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Teacher</th>
                <th className="p-2">Grade</th>
                <th className="p-2">Section</th>
                <th className="p-2">Subject</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id} className="border-b border-border">
                  <td className="p-2">{a.teacher?.name || "Teacher"}</td>
                  <td className="p-2">Grade {a.grade?.level}</td>
                  <td className="p-2">{a.section?.name}</td>
                  <td className="p-2">{a.subject?.name}</td>
                  <td className="p-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => removeAssignment(a._id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-3 text-muted-foreground">
                    No teaching assignments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts"
            className="rounded-lg border border-border bg-input px-3 py-2"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Name</th>
                <th className="p-2">Username</th>
                <th className="p-2">Email</th>
                <th className="p-2">Role / enrollment</th>
                <th className="p-2">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border">
                  <td className="p-2">{u.name}</td>
                  <td className="p-2">{u.username || "—"}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2 capitalize">
                    {u.role}
                    {u.role === "student" && (
                      <>
                        {" "}
                        · Grade {u.grade?.level ?? "—"} {u.section?.name ?? ""}
                      </>
                    )}
                  </td>
                  <td className="p-2">{u.isActive ? "Active" : "Inactive"}</td>
                  <td className="p-2 text-right">
                    <span className="inline-flex gap-2">
                      {u.role === "student" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingStudent(u);
                            setEditGradeId(String(u.grade?._id ?? ""));
                            setEditSectionId(String(u.section?._id ?? ""));
                          }}
                        >
                          Change class
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleActive(u)}
                      >
                        {u.isActive ? "Suspend" : "Activate"}
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-3 text-muted-foreground">
                    No accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveEnrollment}
            className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6"
          >
            <h2 className="text-lg font-semibold">
              Change {editingStudent.name}&apos;s class
            </h2>
            <select
              required
              value={editGradeId}
              onChange={(e) => {
                setEditGradeId(e.target.value);
                setEditSectionId("");
              }}
              className="w-full rounded-lg border border-border bg-input px-3 py-2"
            >
              <option value="">Select grade</option>
              {grades.map((g) => (
                <option key={g._id} value={g._id}>
                  Grade {g.level}
                </option>
              ))}
            </select>
            <select
              required
              value={editSectionId}
              onChange={(e) => setEditSectionId(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2"
            >
              <option value="">Select section</option>
              {sections
                .filter((s) => String(s.grade?._id ?? s.grade) === editGradeId)
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingStudent(null)}
              >
                Cancel
              </Button>
              <Button type="submit">Save enrollment</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
