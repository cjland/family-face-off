/**
 * Custom question sets: the spreadsheet template, a small CSV reader, row checking, and the
 * "audio list" that says which announcer clips to record. Shared by the server and the host page.
 */

export const TEMPLATE_HEADERS = [
  "Group Name",
  "Genre",
  "Difficulty",
  "Question",
  "Choice A",
  "Choice B",
  "Choice C",
  "Choice D",
  "Correct (A-D)",
  "Seconds (optional)",
] as const;

/** Clearly made-up sample rows so the template shows the format. Delete them before uploading. */
const SAMPLE_ROWS = [
  ["Sample Movie Night", "Movies", "easy", "Which movie features a fish named Nemo?", "Finding Nemo", "Shark Tale", "The Little Mermaid", "Moana", "A", ""],
  ["Sample Movie Night", "Movies", "medium", "How many Toy Story movies came out before 2020?", "Two", "Three", "Four", "Five", "B", "25"],
  ["Sample Family Facts", "Our Family", "hard", "Which city did Grandpa grow up in? (replace with your own!)", "Springfield", "Riverside", "Fairview", "Lakeside", "C", ""],
];

export type CustomQuestionInput = {
  groupName: string;
  genre: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  seconds: number | null;
};

export type RowError = { row: number; message: string };

const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => esc(c ?? "")).join(",")).join("\r\n") + "\r\n";
}

export function templateCsv(): string {
  return toCsv([[...TEMPLATE_HEADERS], ...SAMPLE_ROWS]);
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas/newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const COLUMN_ALIASES: Record<string, string[]> = {
  group: ["groupname", "group", "set", "category"],
  genre: ["genre", "topic"],
  difficulty: ["difficulty", "level"],
  question: ["question", "questiontext"],
  a: ["choicea", "answera", "a", "option1", "choice1"],
  b: ["choiceb", "answerb", "b", "option2", "choice2"],
  c: ["choicec", "answerc", "c", "option3", "choice3"],
  d: ["choiced", "answerd", "d", "option4", "choice4"],
  correct: ["correctad", "correct", "answer", "correctanswer", "right"],
  seconds: ["secondsoptional", "seconds", "time", "timeseconds"],
};

/**
 * Turns uploaded CSV text into questions. Bad rows are reported (with their spreadsheet row
 * number) and skipped; good rows are returned.
 */
export function readQuestions(text: string): { questions: CustomQuestionInput[]; errors: RowError[] } {
  const rows = parseCsv(text);
  const errors: RowError[] = [];
  if (!rows.length) return { questions: [], errors: [{ row: 1, message: "The file is empty." }] };
  const header = rows[0].map(norm);
  const col: Record<string, number> = {};
  for (const [key, names] of Object.entries(COLUMN_ALIASES)) col[key] = header.findIndex((h) => names.includes(h));
  const missing = ["group", "question", "a", "b", "c", "d", "correct"].filter((k) => col[k] < 0);
  if (missing.length) {
    return {
      questions: [],
      errors: [{ row: 1, message: `Missing column(s): ${missing.map((k) => (k.length === 1 ? `Choice ${k.toUpperCase()}` : k)).join(", ")}. Use the template's header row.` }],
    };
  }
  const questions: CustomQuestionInput[] = [];
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const get = (k: string) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    const groupName = get("group");
    const question = get("question");
    const options = [get("a"), get("b"), get("c"), get("d")];
    const fail = (message: string) => errors.push({ row: rowNo, message });
    if (!groupName) return fail("Group Name is empty.");
    if (groupName.length > 60) return fail("Group Name is longer than 60 characters.");
    if (!question) return fail("Question is empty.");
    if (question.length > 300) return fail("Question is longer than 300 characters.");
    if (options.some((o) => !o)) return fail("All four choices (A–D) are needed.");
    if (options.some((o) => o.length > 120)) return fail("A choice is longer than 120 characters.");
    if (new Set(options.map((o) => o.toLowerCase())).size < 4) return fail("Two choices are the same.");
    const c = get("correct").toUpperCase();
    let correctIndex = ["A", "B", "C", "D"].indexOf(c);
    if (correctIndex < 0 && /^[1-4]$/.test(c)) correctIndex = Number(c) - 1;
    if (correctIndex < 0) correctIndex = options.findIndex((o) => o.toUpperCase() === c);
    if (correctIndex < 0) return fail("Correct must be A, B, C or D.");
    const d = get("difficulty").toLowerCase();
    const difficulty = (["easy", "medium", "hard"].includes(d) ? d : "medium") as CustomQuestionInput["difficulty"];
    if (d && !["easy", "medium", "hard"].includes(d)) fail(`Difficulty "${get("difficulty")}" isn't easy/medium/hard, so it was set to medium.`);
    const genre = get("genre").slice(0, 60);
    const sec = get("seconds");
    let seconds: number | null = null;
    if (sec) {
      const n = Number(sec);
      if (!Number.isInteger(n) || n < 5 || n > 120) return fail("Seconds must be a whole number from 5 to 120 (or left blank).");
      seconds = n;
    }
    questions.push({ groupName, genre, difficulty, question, options: options as CustomQuestionInput["options"], correctIndex, seconds });
  });
  return { questions, errors };
}

/**
 * Which announcer clips to record for these questions: the question (questions/<id>.mp3) and,
 * for later, the answer (answers/<id>.mp3). Until a clip exists the announcer says "read it on the
 * screen" instead.
 */
export function audioListCsv(items: { audioId: string; groupName: string; question: string; answer: string }[]): string {
  return toCsv([
    ["Audio ID", "Group Name", "Question file", "Question text to record", "Answer file (optional, future)", "Answer text to record"],
    ...items.map((q) => [q.audioId, q.groupName, `questions/${q.audioId}.mp3`, q.question, `answers/${q.audioId}.mp3`, q.answer]),
  ]);
}
