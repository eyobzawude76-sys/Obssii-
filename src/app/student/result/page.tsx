"use client";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { oromoErrorMessage } from "@/lib/oromo-errors";

type CompletedTest = {
  _id: string;
  test: {
    _id: string;
    title: string;
    subject: string;
    testDate: string;
  };
  percentage: number;
  correctAnswers: number;
  totalQuestions: number;
  submittedAt: string;
};

export default function StudentResultsList() {
  const [results, setResults] = useState<CompletedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch("/api/student/results/completed");
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || "Could not load results.");
      setResults(data.results || []);
    } catch (error) {
      setError(
        oromoErrorMessage(error, "Bu'aa qormaataa fe'uun hin dandeenye. Fuula haaromsiitii irra deebi'ii yaali."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold tracking-tight text-green-700 mb-4">
        Completed Tests
      </h1>

      {loading ? (
        <div className="text-sm text-muted-foreground">Bu'aan fe'aa jira...</div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700">{error}</p>
          <Button onClick={() => void load()} variant="outline">
            Retry
          </Button>
        </div>
      ) : results.length === 0 ? (
        <div className="w-full flex flex-col items-center justify-center min-h-[200px] bg-muted border border-border rounded-xl">
          <div className="text-xl text-muted-foreground font-semibold">
            No Completed Tests
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Tests you complete will appear here.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {results.map((result) => (
            <Link
              key={String(result._id)}
              href={`/student/result/${result._id}`}
              className="rounded-2xl bg-white border border-border shadow-sm p-6 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3 mb-2">
                <CheckCircle2 className="w-6 h-6 text-green-600 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-lg text-green-800 mb-1">
                    {result.test?.title || "Test"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Subject: {result.test?.subject || "-"}
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                      Score
                    </div>
                    <div className="font-bold text-2xl text-green-700">
                      {result.percentage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                      Correct
                    </div>
                    <div className="font-bold text-2xl text-green-700">
                      {result.correctAnswers}/{result.totalQuestions}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground mt-2">
                Submitted: {new Date(result.submittedAt).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
