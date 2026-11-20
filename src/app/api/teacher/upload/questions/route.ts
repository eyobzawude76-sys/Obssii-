import { type NextRequest, NextResponse } from "next/server";
import { encryptString } from "@/lib/encryption";
import dbConnect from "@/lib/mongoose-connect";
import { getAuthOrThrow } from "@/lib/with-auth";
import Question from "@/models/Question";
import Result from "@/models/Result";
import TeacherAssignment from "@/models/TeacherAssignment";
import Test from "@/models/Test";

export const runtime = "nodejs";

function parseCsvQuestions(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted || rows.length < 2) return [];
  const headerRow = rows.shift();
  if (!headerRow) return [];
  const headers = headerRow.map((header) =>
    header.toLowerCase().replace(/[^a-z]/g, ""),
  );
  const find = (...aliases: string[]) =>
    headers.findIndex((header) => aliases.includes(header));
  const indexes = [
    find("question", "prompt"),
    find("optiona", "a"),
    find("optionb", "b"),
    find("optionc", "c"),
    find("optiond", "d"),
    find("correctanswer", "answer", "correct"),
  ];
  if (indexes.some((index) => index < 0)) return [];
  return rows
    .map((cells) => {
      const [question, a, b, c, d, answer] = indexes.map(
        (index) => cells[index] || "",
      );
      const answerIndex = /^[a-d]$/i.test(answer)
        ? answer.toUpperCase().charCodeAt(0) - 65
        : Number(answer) - 1;
      return { question, options: [a, b, c, d], answerIndex };
    })
    .filter(
      (item) =>
        item.question &&
        item.options.every(Boolean) &&
        Number.isInteger(item.answerIndex) &&
        item.answerIndex >= 0 &&
        item.answerIndex < 4,
    );
}

async function readFileToText(
  file: File,
): Promise<{ text: string; type: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) {
    return { text: buf.toString("utf8"), type: "txt" };
  }
  if (name.endsWith(".doc") && !name.endsWith(".docx")) {
    throw new Error(
      ".doc (old Word format) is not supported. Please save as .docx and try again.",
    );
  }
  if (name.endsWith(".docx")) {
    try {
      const mammothMod = (await import("mammoth")) as any;
      const extract =
        mammothMod?.extractRawText || mammothMod?.default?.extractRawText;
      if (typeof extract !== "function")
        throw new Error("mammoth extractRawText not found");
      const res = await extract({ buffer: buf });
      return { text: res?.value || "", type: "word" };
    } catch (_e) {
      throw new Error(
        "DOCX parsing not available. Ensure 'mammoth' is installed on the server runtime.",
      );
    }
  }
  if (name.endsWith(".pptx")) {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buf);
      let extractedText = "";

      // Get all slide files
      const slideFiles: string[] = [];
      zip.forEach((relativePath) => {
        if (
          relativePath.startsWith("ppt/slides/slide") &&
          relativePath.endsWith(".xml")
        ) {
          slideFiles.push(relativePath);
        }
      });

      // Sort slides by number
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || "0", 10);
        const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || "0", 10);
        return numA - numB;
      });

      // Extract text from each slide
      for (const slideFile of slideFiles) {
        const slideXml = await zip.file(slideFile)?.async("text");
        if (!slideXml) continue;

        // Extract text from <a:t> tags (text content)
        const textMatches = slideXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
        const slideTexts: string[] = [];
        for (const match of textMatches) {
          const text = match[1]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .trim();
          if (text) slideTexts.push(text);
        }

        if (slideTexts.length > 0) {
          extractedText += `${slideTexts.join("\n")}\n\n`;
        }
      }

      // Also extract notes (where answers are stored)
      const notesFiles: string[] = [];
      zip.forEach((relativePath) => {
        if (
          relativePath.startsWith("ppt/notesSlides/notesSlide") &&
          relativePath.endsWith(".xml")
        ) {
          notesFiles.push(relativePath);
        }
      });

      notesFiles.sort((a, b) => {
        const numA = parseInt(a.match(/notesSlide(\d+)\.xml/)?.[1] || "0", 10);
        const numB = parseInt(b.match(/notesSlide(\d+)\.xml/)?.[1] || "0", 10);
        return numA - numB;
      });

      for (const noteFile of notesFiles) {
        const noteXml = await zip.file(noteFile)?.async("text");
        if (!noteXml) continue;

        const textMatches = noteXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
        for (const match of textMatches) {
          const text = match[1]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .trim();
          if (text?.toLowerCase().startsWith("answer")) {
            extractedText += `${text}\n`;
          }
        }
      }

      return { text: extractedText.trim(), type: "powerpoint" };
    } catch (e: any) {
      throw new Error(
        `PPTX parsing failed: ${e.message}. Ensure the file is a valid PowerPoint file.`,
      );
    }
  }
  throw new Error("Unsupported file type. Please upload .docx, .pptx, or .txt");
}

function parseMcqsFromText(text: string, fileType: string = "txt") {
  const out: { question: string; options: string[]; answerIndex: number }[] =
    [];
  const normalized = text.replace(/\u00A0/g, " ").replace(/\r/g, "");

  // If it's PowerPoint, use slide-based parsing
  if (fileType === "powerpoint") {
    // Split by double newlines (slide boundaries)
    const slides = normalized.split(/\n\n+/).filter(Boolean);

    for (const slide of slides) {
      const lines = slide
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 5) continue; // Need at least question + 4 options

      // First line is the question
      const questionText = lines[0];

      // Extract options (A), B), C), D))
      const options: string[] = [];
      let answerIndex = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Check if this is an answer line
        if (/^answer\s*:\s*([A-D])/i.test(line)) {
          const match = line.match(/^answer\s*:\s*([A-D])/i);
          if (match) {
            answerIndex = match[1].toUpperCase().charCodeAt(0) - 65;
          }
          continue;
        }

        // Check if this is an option line
        const optionMatch = line.match(/^([A-D])\)\s*(.+)/i);
        if (optionMatch && options.length < 4) {
          options.push(optionMatch[2].trim());
        }
      }

      // Add question if we have all 4 options
      if (questionText && options.length === 4) {
        out.push({ question: questionText, options, answerIndex });
      }
    }

    if (out.length > 0) return out;
  }

  // Standard Q1. format parsing
  const re =
    /Q\s*(\d+)\.\s*([\s\S]*?)\n+\s*A\)\s*([\s\S]*?)\n+\s*B\)\s*([\s\S]*?)\n+\s*C\)\s*([\s\S]*?)\n+\s*D\)\s*([\s\S]*?)\n+\s*Answer\s*:\s*([A-D])/gi;
  for (let m = re.exec(normalized); m !== null; m = re.exec(normalized)) {
    const q = m[2].trim();
    const opts = [m[3], m[4], m[5], m[6]].map((s) => s.trim());
    const ans = (m[7] || "A").toUpperCase().charCodeAt(0) - 65;
    if (q && opts.every(Boolean))
      out.push({ question: q, options: opts, answerIndex: ans });
  }
  if (out.length > 0) return out;

  // Fallback: block parsing for simpler cases
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const block of blocks) {
    const lines = block
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 5) continue;
    const qline = lines[0].replace(/^Q\d+\.?\s*/i, "");
    const opts: string[] = [];
    for (let i = 1; i <= 4 && i < lines.length; i++) {
      opts.push(lines[i].replace(/^[A-D][).-]\s*/, ""));
    }
    const ansLine = lines.find((l) => /^answer\s*:/i.test(l));
    let answerIndex = 0;
    if (ansLine) {
      const mm = ansLine.match(/[A-D]/i);
      if (mm) answerIndex = mm[0].toUpperCase().charCodeAt(0) - 65;
    }
    if (opts.length === 4)
      out.push({ question: qline, options: opts, answerIndex });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthOrThrow("teacher");
  if ("error" in auth) return auth.error;
  await dbConnect();
  const form = await req.formData();
  const file = form.get("file");
  const subject = String(form.get("subject") || "");
  const testId = String(form.get("testId") || "");
  const createdBy = auth.user.id;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const test = await Test.findOne({ _id: testId, teacher: auth.user.id });
  if (!test)
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  if (
    !(test as any).assignment ||
    !(await TeacherAssignment.exists({
      _id: (test as any).assignment,
      teacher: auth.user.id,
    }))
  )
    return NextResponse.json(
      { error: "Assignment access denied" },
      { status: 403 },
    );
  if (test.isPublished)
    return NextResponse.json(
      { error: "Unpublish the exam before changing questions" },
      { status: 409 },
    );
  if (await Result.exists({ test: testId }))
    return NextResponse.json(
      { error: "Questions cannot change after a submission" },
      { status: 409 },
    );

  try {
    let text = "",
      type = "csv";
    if (file.name.toLowerCase().endsWith(".csv"))
      text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    else ({ text, type } = await readFileToText(file));
    const parsed =
      type === "csv" ? parseCsvQuestions(text) : parseMcqsFromText(text, type);

    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid MCQs detected. CSV requires question, optionA, optionB, optionC, optionD, correctAnswer columns. Text uploads use Q1., A), B), C), D), Answer: X.",
        },
        { status: 400 },
      );
    }

    const questionsDoc = {
      testId,
      subject,
      createdBy,
      uploadedFileName: (file as File).name,
      uploadedAt: new Date(),
      fileType: type as any,
      questions: parsed.map((q, idx) => ({
        questionNumber: idx + 1,
        encryptedQuestion: encryptString(q.question),
        encryptedOptions: q.options.map(encryptString),
        correctAnswerIndex: q.answerIndex,
      })),
    } as any;

    const saved = await Question.findOneAndUpdate(
      { testId },
      { $set: questionsDoc },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await Test.findByIdAndUpdate(testId, {
      $set: { totalQuestions: parsed.length, fileType: type },
    });

    return NextResponse.json({ ok: true, count: parsed.length, id: saved._id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Upload failed" },
      { status: 500 },
    );
  }
}
