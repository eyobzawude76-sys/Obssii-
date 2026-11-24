"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { oromoErrorMessage } from "@/lib/oromo-errors";

type ResultMetadata = {
  test?: {
    title?: string;
    subject?: string;
    testDate?: string;
  } | null;
  result: { percentage: number };
};

export default function StudentResultPage() {
  const { id: resultId } = useParams<{ id: string }>();
  const [visible, setVisible] = useState(true);
  const [percentage, setPercentage] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ResultMetadata | null>(null);

  useEffect(() => {
    if (!resultId) return;
    const key = `result-viewed-${resultId}`;
    const seen = sessionStorage.getItem(key);
    if (seen) setVisible(false);
  }, [resultId]);

  useEffect(() => {
    const load = async () => {
      if (!resultId) return;
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/student/results/${resultId}`);
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          setError(
            "Bu'aan kun amma hin jiru. Barsiisaan hanga ammaatti hin maxxansine ta'uu danda'a.",
          );
          return;
        }
        setPercentage(data.result?.percentage ?? 0);
        setMeta({ test: data.test, result: data.result });
      } catch {
        setError(oromoErrorMessage("network error", "Bu'aa qormaataa fe'uun hin danda'amne. Intarneetii kee mirkaneeffadhu."));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [resultId]);

  const close = () => {
    if (!resultId) return;
    sessionStorage.setItem(`result-viewed-${resultId}`, "1");
    setVisible(false);
  };

  if (!visible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-lg text-muted-foreground font-semibold">
        <div>Result closed. You can't view it again.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !meta?.result) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="max-w-lg text-red-700">
          {error || "Bu'aan qormaataa hin argamne."}
        </p>
        <div className="flex gap-3">
          <Button onClick={() => window.location.reload()} variant="outline">
            Retry
          </Button>
          <Button asChild>
            <Link href="/student/result">Back to results</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 min-h-[70vh]">
      <div className="bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-8 border border-green-200 animate-in fade-in">
        <div className="text-2xl font-bold text-green-700">Result Summary</div>
        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg
            width="160"
            height="160"
            role="img"
            aria-label={`Score ${percentage} percent`}
          >
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="#D1FAE5"
              strokeWidth="16"
              fill="none"
            />
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="#4ade80"
              strokeWidth="16"
              fill="none"
              strokeDasharray={2 * Math.PI * 70}
              strokeDashoffset={
                2 *
                Math.PI *
                70 *
                (1 - Math.min(Math.max(percentage, 0), 100) / 100)
              }
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-green-700 animate-in duration-1000">
              {Number.isNaN(percentage) ? 0 : percentage}%
            </span>
            <span className="mt-1 text-green-700 text-xs font-medium">
              Score
            </span>
          </div>
        </div>
        <ul className="flex flex-col gap-2 text-green-800 text-lg">
          <li>
            <b>Result ID:</b> {String(resultId)}
          </li>
          <li>
            <b>Percentage:</b> {Number.isNaN(percentage) ? 0 : percentage}%
          </li>
          {meta?.test ? (
            <>
              <li>
                <b>Test:</b> {meta.test.title} ({meta.test.subject})
              </li>
              <li>
                <b>Date:</b>{" "}
                {meta.test.testDate
                  ? new Date(meta.test.testDate).toLocaleDateString()
                  : "-"}
              </li>
            </>
          ) : null}
        </ul>
        <div className="mt-4 flex flex-col sm:flex-row justify-center gap-3">
          <Button asChild className="bg-green-600 hover:bg-green-700 text-white">
            <Link href={`/student/review/${resultId}`}>
              Deebii koo bal'inaan ilaali
            </Link>
          </Button>
          <Button
            onClick={close}
            variant="outline"
            className="px-6 py-2 text-base rounded-lg"
          >
            Bu'aa cufi
          </Button>
        </div>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        Note: You will not be able to see this result again.
      </div>
    </div>
  );
}
