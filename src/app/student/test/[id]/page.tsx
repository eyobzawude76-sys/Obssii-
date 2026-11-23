"use client";
import { AlertCircle, CheckCircle2, Clock, FileText } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import TermsModal from "@/components/test/TermsModal";
import { Button } from "@/components/ui/button";
import { oromoErrorMessage } from "@/lib/oromo-errors";

export default function StudentTestPage() {
  const { id: testId } = useParams<{ id: string }>();

  const [index, setIndex] = useState<number>(1);
  const [question, setQuestion] = useState<string>("");
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [testTitle, setTestTitle] = useState<string>("");
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [serverClockOffset, setServerClockOffset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Terms and conditions state
  const [terms, setTerms] = useState<string[]>([]);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(true);
  const submissionInFlight = useRef(false);
  const autoSubmitStarted = useRef(false);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const checkTerms = useCallback(async () => {
    if (!testId) {
      setCheckingTerms(false);
      return;
    }
    try {
      setCheckingTerms(true);
      setTermsError(null);
      const response = await fetch(`/api/student/tests/${testId}/terms`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Could not load exam instructions.");
      }

      if (data?.terms?.length > 0) {
        setTerms(data.terms);
        setTestTitle(data.testTitle || "Test");
        setShowTermsModal(true);
      } else {
        setTermsAccepted(true);
      }
    } catch (error) {
      setTermsError(oromoErrorMessage(error, "Qajeelfama qormaataa fe'uun hin danda'amne."));
    } finally {
      setCheckingTerms(false);
    }
  }, [testId]);

  useEffect(() => {
    void checkTerms();
  }, [checkTerms]);

  const handleAcceptTerms = () => {
    setShowTermsModal(false);
    setTermsAccepted(true);
  };

  // Prevent browser back button and disable back navigation
  useEffect(() => {
    // Request fullscreen on mount
    const enterFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn("Fullscreen request failed:", err);
      }
    };
    enterFullscreen();

    // Monitor fullscreen changes and re-enter if exited
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        alert("Yeroo qormaataa guutuu fullscreen irratti turuu qabda.");
        enterFullscreen();
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Push a dummy state to prevent back navigation
    window.history.pushState(null, "", window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, "", window.location.href);
      alert(
        "Yeroo qormaataa keessa fuula biraatti ce'uun hin hayyamamu. Ba'uuf qormaata ergi.",
      );
    };

    window.addEventListener("popstate", handlePopState);

    // Disable context menu (right-click)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener("contextmenu", handleContextMenu);

    // Warn on page unload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "Are you sure you want to leave? Your test progress will be lost.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Prevent opening new tabs/windows (Ctrl+T, Ctrl+N, Ctrl+Shift+N, Ctrl+W)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Ctrl+T (new tab)
      if (e.ctrlKey && e.key === "t") {
        e.preventDefault();
        alert("Yeroo qormaataa tab haaraa banuun hin hayyamamu.");
        return false;
      }
      // Prevent Ctrl+N (new window)
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        alert("Yeroo qormaataa foddaa haaraa banuun hin hayyamamu.");
        return false;
      }
      // Prevent Ctrl+Shift+N (incognito window)
      if (e.ctrlKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
        alert("Opening new windows is disabled during the test.");
        return false;
      }
      // Prevent Ctrl+W (close tab)
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        alert("Ba'uuf dura qormaata kee ergi.");
        return false;
      }
      // Prevent Alt+F4 (close window) - Windows
      if (e.altKey && e.key === "F4") {
        e.preventDefault();
        alert("Please submit the test to exit.");
        return false;
      }
      // Prevent Cmd+T, Cmd+N on Mac
      if (e.metaKey && (e.key === "t" || e.key === "n")) {
        e.preventDefault();
        alert("Yeroo qormaataa tab ykn foddaa haaraa banuun hin hayyamamu.");
        return false;
      }
      // Prevent Cmd+W on Mac
      if (e.metaKey && e.key === "w") {
        e.preventDefault();
        alert("Please submit the test to exit.");
        return false;
      }
      // Prevent F11 (fullscreen toggle)
      if (e.key === "F11") {
        e.preventDefault();
        return false;
      }
      // Prevent Escape key (exit fullscreen)
      if (e.key === "Escape") {
        e.preventDefault();
        alert("Please stay in fullscreen mode during the test.");
        return false;
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // Detect when window loses focus (user switched tabs/windows)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        alert(
          "⚠️ Test monitoring: You switched away from the test window. Please return immediately.",
        );
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleBlur = () => {
      console.warn("Window lost focus - possible tab switch detected");
    };
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);

      // Exit fullscreen when leaving the test
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const finalize = useCallback(async () => {
    if (
      !testId ||
      !attemptId ||
      submissionInFlight.current ||
      submissionComplete
    ) {
      return;
    }
    submissionInFlight.current = true;
    setSubmitting(true);
    setSubmissionError(null);
    try {
      const r = await fetch(`/api/student/tests/${testId}/submit-final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok) {
        setAutoSubmitted(
          data?.autoSubmitted === true || autoSubmitStarted.current,
        );
        setSubmissionComplete(true);
      } else {
        setSubmissionError(oromoErrorMessage(data?.error, "Qormaata erguu hin dandeenye. Intarneetii kee mirkaneeffadhuutii irra deebi'ii yaali."));
      }
    } catch {
      setSubmissionError(oromoErrorMessage("network error", "Qormaata erguu hin dandeenye. Intarneetii kee mirkaneeffadhuutii irra deebi'ii yaali."));
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  }, [attemptId, submissionComplete, testId]);

  const load = useCallback(
    async (i: number) => {
      if (!testId || !termsAccepted) return;
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(
          `/api/student/tests/${testId}/question?index=${i}`,
        );
        const data = await r.json();
        if (!r.ok) {
          if (data?.autoSubmitted || data?.alreadySubmitted) {
            setAutoSubmitted(data?.autoSubmitted === true);
            setSubmissionComplete(true);
            return;
          }
          setError(oromoErrorMessage(data?.error, "Gaaffii qormaataa fe'uun hin danda'amne. Irra deebi'ii yaali."));
          return;
        }
        setAttemptId(data.attemptId);
        if (typeof data.deadlineAt === "number") {
          setDeadlineAt(data.deadlineAt);
          setServerClockOffset(
            typeof data.serverNow === "number"
              ? data.serverNow - Date.now()
              : 0,
          );
        }
        setQuestion(data.question);
        setOptions(data.options || []);
        setTestTitle(data.testTitle || "Test");
        setTotalQuestions(data.totalQuestions || 0);
        const hasSavedAnswer = Number.isInteger(data.savedOption);
        setSelected(hasSavedAnswer ? data.savedOption : null);
        setAnswerLocked(hasSavedAnswer);
        setAnswerError(null);
      } catch {
        setError(oromoErrorMessage("network error", "Gaaffii qormaataa fe'uun hin danda'amne. Intarneetii kee mirkaneeffadhu."));
      } finally {
        setLoading(false);
      }
    },
    [testId, termsAccepted],
  );

  useEffect(() => {
    if (testId && termsAccepted) load(index);
  }, [index, testId, termsAccepted, load]);

  // Keep the display synchronized to the server-provided attempt deadline.
  useEffect(() => {
    if (deadlineAt === null || submissionComplete) return;
    const updateRemainingTime = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadlineAt - (Date.now() + serverClockOffset)) / 1000),
      );
      setRemainingSeconds(remaining);
    };
    updateRemainingTime();
    const id = setInterval(updateRemainingTime, 1000);
    return () => clearInterval(id);
  }, [deadlineAt, serverClockOffset, submissionComplete]);

  useEffect(() => {
    if (
      remainingSeconds === 0 &&
      attemptId &&
      !submissionComplete &&
      !autoSubmitStarted.current
    ) {
      autoSubmitStarted.current = true;
      setAutoSubmitted(true);
      void finalize();
    }
  }, [attemptId, finalize, remainingSeconds, submissionComplete]);

  const submitAnswer = async () => {
    if (selected == null || !testId || !attemptId) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/student/tests/${testId}/submit-question`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            questionNumber: index,
            chosenOption: selected,
            timeTakenSec: 0,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (data?.attemptCompleted || data?.autoSubmitted) {
          setAutoSubmitted(data?.autoSubmitted === true);
          setSubmissionComplete(true);
          return;
        }
        if (
          data?.answerAlreadySubmitted &&
          Number.isInteger(data.savedOption)
        ) {
          setSelected(data.savedOption);
          setAnswerLocked(true);
        }
        setAnswerError(oromoErrorMessage(data?.error, "Deebii kee galmeessuu hin dandeenye. Irra deebi'ii yaali."));
        return;
      }
      setAnswerError(null);
      setAnswerLocked(true);
      if (index >= totalQuestions) {
        await finalize();
      } else {
        setIndex(index + 1);
      }
    } catch {
      setAnswerError("Network error while saving your answer. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitTest = () => {
    setShowSubmitConfirm(true);
  };

  const confirmSubmit = () => {
    setShowSubmitConfirm(false);
    finalize();
  };

  if (submissionComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-green-50 via-white to-blue-50 p-4">
        <div className="max-w-lg rounded-2xl border border-green-200 bg-white p-8 text-center shadow-lg">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-600" />
          <h1 className="mb-3 text-2xl font-bold text-green-800">
            {autoSubmitted ? "Time expired" : "Exam submitted"}
          </h1>
          <p className="text-gray-700">
            Your answers have been submitted. Your result will be available
            after your teacher publishes it.
          </p>
          <Button asChild className="mt-6 bg-green-600 hover:bg-green-700">
            <a href="/student/result">View published results</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-green-50 via-white to-blue-50 flex flex-col">
      {/* Terms and Conditions Modal */}
      {showTermsModal && (
        <TermsModal
          terms={terms}
          testTitle={testTitle}
          onAccept={handleAcceptTerms}
        />
      )}

      {/* Show loading state while checking terms */}
      {checkingTerms && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-green-700 font-medium">Preparing your test...</p>
          </div>
        </div>
      )}

      {!checkingTerms && termsError && !termsAccepted && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-lg rounded-2xl border-2 border-red-200 bg-white p-8 text-center shadow-lg">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-600" />
            <p className="font-semibold text-red-700">{termsError}</p>
            <p className="mt-2 text-sm text-gray-600">
              Exam instructions must load before you can continue.
            </p>
            <Button
              onClick={() => void checkTerms()}
              className="mt-6 bg-green-600 hover:bg-green-700"
            >
              Retry loading instructions
            </Button>
          </div>
        </div>
      )}

      {/* Main test content - only show after terms are accepted */}
      {!checkingTerms && termsAccepted && (
        <>
          {/* Fixed Header */}
          <header className="sticky top-0 z-50 bg-white border-b-2 border-green-600 shadow-md">
            <div className="max-w-6xl mx-auto px-4 py-4">
              {/* Organization Name */}
              <div className="text-center mb-3">
                <h1 className="text-xl md:text-2xl font-bold text-green-700">
                  EDU-X International
                </h1>
              </div>

              {/* Test Info Bar */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-green-50 rounded-lg px-4 py-3 border border-green-200">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-900">
                    {testTitle || "Loading..."}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-sm font-medium text-green-700">
                    Question{" "}
                    <span className="text-green-900 font-bold text-lg">
                      {index}
                    </span>
                    <span className="mx-1">/</span>
                    <span className="text-green-900 font-bold text-lg">
                      {totalQuestions}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-green-300">
                    <Clock className="w-5 h-5 text-green-600 animate-pulse" />
                    <span className="font-mono font-bold text-green-900 text-lg select-none">
                      {remainingSeconds === null
                        ? "--:--"
                        : formatTime(remainingSeconds)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
            {error ? (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
                <p className="text-red-700 font-semibold text-lg">{error}</p>
                {submissionError && (
                  <div className="mt-4">
                    <p className="text-red-700">{submissionError}</p>
                    <Button
                      onClick={finalize}
                      disabled={submitting}
                      className="mt-3"
                    >
                      {submitting ? "Submitting..." : "Retry final submission"}
                    </Button>
                  </div>
                )}
                <div className="mt-4 flex justify-center gap-3">
                  <Button onClick={() => load(index)} variant="outline">
                    Retry loading question
                  </Button>
                  <Button asChild variant="outline">
                    <a href="/student/test">Back to tests</a>
                  </Button>
                </div>
              </div>
            ) : loading ? (
              <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p className="text-green-700 font-medium">
                  Loading question...
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {answerError && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-center">
                    <p className="text-red-700 font-semibold">{answerError}</p>
                  </div>
                )}
                {submissionError && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-center">
                    <p className="text-red-700 font-semibold">
                      {autoSubmitted
                        ? "Time expired, but automatic submission could not be confirmed."
                        : submissionError}
                    </p>
                    <Button
                      onClick={finalize}
                      disabled={submitting}
                      className="mt-3"
                    >
                      {submitting ? "Submitting..." : "Retry final submission"}
                    </Button>
                  </div>
                )}
                {/* Question Card */}
                <div className="bg-white rounded-2xl shadow-xl border-2 border-green-200 p-8">
                  <div className="mb-2 text-sm font-semibold text-green-600 uppercase tracking-wide">
                    Question {index}
                  </div>
                  <div className="text-xl md:text-2xl font-semibold text-gray-900 leading-relaxed">
                    {question}
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-4">
                  {options.map((opt, idx) => (
                    <label
                      key={`${String.fromCharCode(65 + idx)}-${opt}`}
                      className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                        selected === idx
                          ? "bg-green-50 border-green-600 shadow-lg scale-[1.02]"
                          : "bg-white border-gray-200 hover:border-green-400 hover:shadow-md"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={selected === idx}
                        onChange={() => setSelected(idx)}
                        disabled={
                          answerLocked || submitting || remainingSeconds === 0
                        }
                        className="mt-1 w-5 h-5 accent-green-600 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className="font-bold text-green-700 mr-2">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <span className="text-gray-800 text-lg">{opt}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-4 pt-6">
                  <Button
                    onClick={handleSubmitTest}
                    variant="outline"
                    disabled={submitting}
                    className="border-2 border-red-400 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold px-6"
                  >
                    Submit Test
                  </Button>

                  <Button
                    onClick={submitAnswer}
                    disabled={
                      selected === null || submitting || remainingSeconds === 0
                    }
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-6 text-lg shadow-lg"
                  >
                    {submitting ? "Submitting..." : "Next Question →"}
                  </Button>
                </div>

                {/* Important Notice */}
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-semibold mb-1">Important:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>
                          Once you click "Next Question", your answer is final
                          and cannot be changed
                        </li>
                        <li>You cannot go back to previous questions</li>
                        <li>
                          Make sure to select your answer carefully before
                          proceeding
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Submit Confirmation Modal */}
          {showSubmitConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                <div className="text-center mb-6">
                  <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Submit Test?
                  </h3>
                  <p className="text-gray-600">
                    Are you sure you want to submit the test? You have answered{" "}
                    <span className="font-bold text-green-600">
                      {index - 1}
                    </span>{" "}
                    out of <span className="font-bold">{totalQuestions}</span>{" "}
                    questions.
                  </p>
                  {index - 1 < totalQuestions && (
                    <p className="text-red-600 font-semibold mt-2">
                      ⚠️ You haven't completed all questions yet!
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowSubmitConfirm(false)}
                    variant="outline"
                    className="flex-1 border-2"
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmSubmit}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold"
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Yes, Submit"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
