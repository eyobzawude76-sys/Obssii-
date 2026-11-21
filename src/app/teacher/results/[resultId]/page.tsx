"use client";
import ExcelJS from "exceljs";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Download,
  Info,
  Mail,
  User,
  XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type QuestionReview = {
  questionNumber: number;
  question: string;
  options: string[];
  studentAnswerIndex: number | null;
  isCorrect: boolean | null;
  explanation: string | null;
};

type DetailedResult = {
  student: {
    _id: string;
    name: string;
    email: string;
    studentId?: string;
    grade?: { level?: number } | null;
    section?: { name?: string } | null;
  };
  test: {
    _id: string;
    title: string;
    subject: string;
  };
  totalQuestions: number;
  correctAnswers: number;
  percentage: number;
  submittedAt: string;
  finalized: boolean;
  published: boolean;
  questions: QuestionReview[];
};

export default function TeacherResultDetailPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const router = useRouter();
  const [data, setData] = useState<DetailedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMarks, setSavingMarks] = useState(false);

  const updateMark = (questionNumber: number, isCorrect: boolean) =>
    setData((current) =>
      current
        ? {
            ...current,
            questions: current.questions.map((question) =>
              question.questionNumber === questionNumber
                ? { ...question, isCorrect }
                : question,
            ),
          }
        : current,
    );
  const saveMarks = async (action: "save" | "finalize" | "publish") => {
    if (!data) return;
    setSavingMarks(true);
    try {
      const response = await fetch(`/api/teacher/results/${resultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "publish"
            ? { publish: true }
            : {
                marks: data.questions
                  .filter((question) => question.studentAnswerIndex !== null)
                  .map((question) => ({
                    questionNumber: question.questionNumber,
                    isCorrect: question.isCorrect,
                  })),
                ...(action === "finalize" ? { finalize: true } : {}),
              },
        ),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not update marks");
      if (action !== "save")
        setData((current) =>
          current
            ? {
                ...current,
                finalized: payload.finalized,
                published: payload.published,
                correctAnswers: payload.correctAnswers,
                percentage: payload.percentage,
              }
            : current,
        );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update result");
    } finally {
      setSavingMarks(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!resultId) return;
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/teacher/results/${resultId}`);
        const result = await r.json();
        if (!r.ok) {
          setError(result.error || "Failed to load result details");
          return;
        }
        setData(result);
      } catch {
        setError("Network error while loading result details");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [resultId]);

  const getOptionLabel = (index: number) => String.fromCharCode(65 + index);

  const handleExportDetailedResult = async () => {
    if (!data) return;

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Detailed Test Result");

      // Add title
      worksheet.mergeCells("A1:F1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "Detailed Test Result";
      titleCell.font = { bold: true, size: 16, color: { argb: "FF6D28D9" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };

      // Student Information Section
      worksheet.addRow([]);
      worksheet.addRow(["Student Information"]);
      worksheet.getRow(3).font = { bold: true, size: 14 };

      worksheet.addRow(["Name:", data.student.name]);
      worksheet.addRow(["Email:", data.student.email]);
      if (data.student.studentId) {
        worksheet.addRow(["Student ID:", data.student.studentId]);
      }

      // Test Information Section
      worksheet.addRow([]);
      const testInfoRow = worksheet.addRow(["Test Information"]);
      testInfoRow.font = { bold: true, size: 14 };

      worksheet.addRow(["Test Name:", data.test.title]);
      worksheet.addRow(["Subject:", data.test.subject]);
      worksheet.addRow([
        "Submitted:",
        new Date(data.submittedAt).toLocaleString(),
      ]);

      // Score Summary Section
      worksheet.addRow([]);
      const scoreSummaryRow = worksheet.addRow(["Score Summary"]);
      scoreSummaryRow.font = { bold: true, size: 14 };

      worksheet.addRow(["Overall Score:", data.finalized ? `${data.finalized ? `${data.percentage}%` : "Pending"}` : "Pending"]);
      worksheet.addRow(["Correct Answers:", data.finalized ? data.correctAnswers : "Pending"]);
      worksheet.addRow(["Wrong Answers:", wrongAnswers.length]);
      worksheet.addRow(["Total Questions:", data.totalQuestions]);

      // Questions Section
      worksheet.addRow([]);
      const questionsHeaderRow = worksheet.addRow([
        "Detailed Question Analysis",
      ]);
      questionsHeaderRow.font = { bold: true, size: 14 };
      worksheet.addRow([]);

      // Questions header
      const headerRow = worksheet.addRow([
        "Q#",
        "Question",
        "Teacher Mark",
        "Student's Answer",
        "Status",
        "Explanation",
      ]);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF6D28D9" },
      };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

      const questionsStartRow = worksheet.rowCount;

      // Add questions
      data.questions.forEach((q) => {
        const studentAnswer =
          q.studentAnswerIndex !== null
            ? `${getOptionLabel(q.studentAnswerIndex)}. ${
                q.options[q.studentAnswerIndex]
              }`
            : "Not Answered";
        const status =
          q.studentAnswerIndex === null
            ? "Unanswered"
            : q.isCorrect === null
              ? "Not Marked"
              : q.isCorrect
                ? "Right"
                : "Wrong";

        const row = worksheet.addRow([
          q.questionNumber,
          q.question,
          q.isCorrect === null ? "Not Marked" : q.isCorrect ? "Right" : "Wrong",
          studentAnswer,
          status,
          q.explanation || "-",
        ]);

        // Color code the status
        const statusCell = row.getCell(5);
        if (status === "Right") {
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF10B981" },
          };
          statusCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
        } else if (status === "Wrong") {
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFEF4444" },
          };
          statusCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
        } else {
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF59E0B" },
          };
          statusCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
        }
      });

      // Set column widths
      worksheet.getColumn(1).width = 5;
      worksheet.getColumn(2).width = 50;
      worksheet.getColumn(3).width = 30;
      worksheet.getColumn(4).width = 30;
      worksheet.getColumn(5).width = 12;
      worksheet.getColumn(6).width = 40;

      // Add borders to question table
      const currentRow = worksheet.rowCount;
      const startRow = questionsStartRow + 1;
      const endRow = currentRow;
      for (let i = startRow; i <= endRow; i++) {
        const row = worksheet.getRow(i);
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { vertical: "top", wrapText: true };
        });
      }

      // Generate Excel file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${data.student.name}_${data.test.title}_Result.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export result:", error);
      alert("Failed to export result. Please try again.");
    }
  };

  const wrongAnswers = data?.questions.filter((q) => q.isCorrect === false || q.studentAnswerIndex === null) || [];
  const pendingMarks = data?.questions.filter((q) => q.studentAnswerIndex !== null && q.isCorrect === null).length || 0;
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading result details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <p className="text-red-700 font-semibold text-lg">
            {error || "Failed to load result details"}
          </p>
          <Button
            onClick={() => router.push("/teacher/results")}
            className="mt-4"
            variant="outline"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Results
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back Button */}
      <div className="flex items-center justify-between gap-4">
        <Button
          onClick={() => router.push("/teacher/results")}
          variant="outline"
          size="sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Results
        </Button>
        <Button
          onClick={handleExportDetailedResult}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export to Excel
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <span className="font-medium">
          Marks: {data.finalized ? "Finalized" : "Review required"} · Result:{" "}
          {data.published ? "Published" : "Unpublished"} · {pendingMarks} answer(s) awaiting marking
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={savingMarks || data.finalized}
            onClick={() => saveMarks("save")}
          >
            Save Marks
          </Button>
          <Button
            disabled={savingMarks || data.finalized}
            onClick={() => saveMarks("finalize")}
          >
            Finalize Marks
          </Button>
          <Button
            disabled={savingMarks || !data.finalized || data.published}
            onClick={() => saveMarks("publish")}
          >
            Publish This Result
          </Button>
        </div>
      </div>

      {/* Student Info Card */}
      <div className="bg-white rounded-2xl shadow-lg border-2 border-violet-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Student Info */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-violet-700 mb-4">
              Student Information
            </h2>
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-violet-600" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-semibold text-lg">{data.student.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-violet-600" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{data.student.email}</p>
              </div>
            </div>
            {data.student.grade?.level && (
              <div className="flex items-center gap-3">
                <Award className="w-5 h-5 text-violet-600" />
                <div><p className="text-sm text-muted-foreground">Grade</p><p className="font-medium">{data.student.grade.level}</p></div>
              </div>
            )}
            {data.student.section?.name && (
              <div className="flex items-center gap-3">
                <Award className="w-5 h-5 text-violet-600" />
                <div><p className="text-sm text-muted-foreground">Section</p><p className="font-medium">{data.student.section.name}</p></div>
              </div>
            )}
            {data.student.studentId && (
              <div className="flex items-center gap-3">
                <Award className="w-5 h-5 text-violet-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Student ID</p>
                  <p className="font-medium">{data.student.studentId}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Test Info */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-violet-700 mb-4">
              Test Information
            </h2>
            <div>
              <p className="text-sm text-muted-foreground">Test Name</p>
              <p className="font-semibold text-lg">{data.test.title}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Subject</p>
              <p className="font-medium">{data.test.subject}</p>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-violet-600" />
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="font-medium">
                  {new Date(data.submittedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-md border-2 border-violet-200 p-6 text-center">
          <div className="text-4xl font-bold text-violet-700 mb-2">
            {data.percentage}%
          </div>
          <div className="text-sm text-muted-foreground">Overall Score</div>
        </div>
        <div className="bg-green-50 rounded-xl shadow-md border-2 border-green-200 p-6 text-center">
          <div className="text-4xl font-bold text-green-700 mb-2">
            {data.finalized ? data.correctAnswers : "—"}
          </div>
          <div className="text-sm text-muted-foreground">Correct Answers</div>
        </div>
        <div className="bg-red-50 rounded-xl shadow-md border-2 border-red-200 p-6 text-center">
          <div className="text-4xl font-bold text-red-700 mb-2">
            {wrongAnswers.length}
          </div>
          <div className="text-sm text-muted-foreground">Wrong Answers</div>
        </div>
        <div className="bg-gray-50 rounded-xl shadow-md border-2 border-gray-200 p-6 text-center">
          <div className="text-4xl font-bold text-gray-700 mb-2">
            {data.totalQuestions}
          </div>
          <div className="text-sm text-muted-foreground">Total Questions</div>
        </div>
      </div>

      {/* Wrong Answers Summary */}
      {wrongAnswers.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-900">
              Questions Marked Wrong / Unanswered
            </h3>
          </div>
          <p className="text-sm text-red-800">
            {wrongAnswers.length} question(s) are wrong or unanswered:{" "}
            <span className="font-semibold">
              {wrongAnswers.map((q) => `Q${q.questionNumber}`).join(", ")}
            </span>
          </p>
        </div>
      )}

      {/* Detailed Question Review */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Detailed Answer Review
        </h2>

        {data.questions.map((q) => (
          <div
            key={q.questionNumber}
            className={`bg-white rounded-2xl shadow-md border-2 p-6 ${
              q.isCorrect === true ? "border-green-300" : q.isCorrect === false ? "border-red-300" : "border-gray-300"
            }`}
          >
            {/* Question Header */}
            <div className="flex items-start gap-3 mb-4">
              {q.isCorrect === true ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 mt-1 shrink-0" />
              ) : q.isCorrect === false ? (
                <XCircle className="w-6 h-6 text-red-600 mt-1 shrink-0" />
              ) : null}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-600">
                    Question {q.questionNumber}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      q.isCorrect === true
                        ? "bg-green-100 text-green-700"
                        : q.isCorrect === false ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {q.isCorrect === null ? (q.studentAnswerIndex === null ? "Unanswered" : "Not marked") : q.isCorrect ? "✓ Right" : "✗ Wrong"}
                  </span>
                </div>
                <p className="text-lg font-medium text-gray-900">
                  {q.question}
                </p>
              </div>
            </div>

            {q.studentAnswerIndex !== null && !data.finalized && (
              <div className="ml-9 mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant={q.isCorrect === true ? "default" : "outline"}
                  onClick={() => updateMark(q.questionNumber, true)}
                >
                  ✓ Right
                </Button>
                <Button
                  size="sm"
                  variant={q.isCorrect === false ? "destructive" : "outline"}
                  onClick={() => updateMark(q.questionNumber, false)}
                >
                  ✗ Wrong
                </Button>
              </div>
            )}

            {/* Options */}
            <div className="space-y-3 ml-9">
              {q.options.map((option, idx) => {
                const isStudentAnswer = idx === q.studentAnswerIndex;

                return (
                  <div
                    key={String.fromCharCode(65 + idx)}
                    className={`p-4 rounded-lg border-2 ${
                      isStudentAnswer
                        ? "bg-blue-50 border-blue-400"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-700">
                        {getOptionLabel(idx)}.
                      </span>
                      <span className="flex-1 text-gray-800">{option}</span>
                      {isStudentAnswer && (
                        <span className="text-xs font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded">
                          Student's Answer
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Explanation */}
            {q.explanation && (
              <div className="mt-4 ml-9 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-blue-900 mb-1">
                      Explanation:
                    </p>
                    <p className="text-blue-800 text-sm">{q.explanation}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Unanswered Notice */}
            {q.studentAnswerIndex === null && (
              <div className="mt-4 ml-9 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-r-lg">
                <p className="text-yellow-800 text-sm font-medium">
                  ⚠️ Student did not answer this question
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="flex justify-center gap-4 pt-6 pb-8">
        <Button
          onClick={() => router.push("/teacher/results")}
          variant="outline"
          size="lg"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Results List
        </Button>
      </div>
    </div>
  );
}
