"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Layers3,
  Users,
  UserCog,
} from "lucide-react";

type DashboardData = {
  summary: {
    totalTeachers: number;
    totalStudents: number;
    totalAdmins: number;
    totalGrades: number;
    totalSections: number;
    totalSubjects: number;
    totalTeachingAssignments: number;
  };
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/admin/dashboard");
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to load setup data");
      }
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load setup data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const cards = data
    ? [
        {
          label: "Teachers",
          value: data.summary.totalTeachers,
          icon: GraduationCap,
          href: "/admin/users",
          description: "Teacher accounts",
        },
        {
          label: "Students",
          value: data.summary.totalStudents,
          icon: Users,
          href: "/admin/users",
          description: "Student accounts",
        },
        {
          label: "Grades",
          value: data.summary.totalGrades,
          icon: BookOpen,
          href: "/admin/academic",
          description: "Academic grades",
        },
        {
          label: "Sections",
          value: data.summary.totalSections,
          icon: Layers3,
          href: "/admin/academic",
          description: "Class sections",
        },
        {
          label: "Subjects",
          value: data.summary.totalSubjects,
          icon: BookOpen,
          href: "/admin/academic",
          description: "Subject catalog",
        },
        {
          label: "Teacher Assignments",
          value: data.summary.totalTeachingAssignments,
          icon: UserCog,
          href: "/admin/users",
          description: "Class, section and subject",
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          System Setup
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Admin manages teacher and student accounts, academic grades,
          sections, subjects, and teacher assignments. Exam questions,
          publishing, grading, and releasing results are handled by teachers.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
          <button
            type="button"
            onClick={() => void loadDashboardData()}
            className="ml-3 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ label, value, icon: Icon, href, description }) => (
              <Link
                key={label}
                href={href}
                className="rounded-xl border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums">
                      {value}
                    </p>
                  </div>
                  <Icon className="size-8 text-primary" aria-hidden="true" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {description}
                </p>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Link
              href="/admin/users"
              className="rounded-xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <h2 className="font-semibold">Manage Teachers & Students</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create accounts, enroll students, and assign teachers to
                classes, sections, and subjects.
              </p>
            </Link>
            <Link
              href="/admin/academic"
              className="rounded-xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <h2 className="font-semibold">Manage Academic Structure</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set up Grade 11 and Grade 12, sections, and subjects.
              </p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
