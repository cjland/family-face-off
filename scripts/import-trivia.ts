/**
 * Imports a trivia file (the trivia-questions.json format: id, category, difficulty, question,
 * correct_answer, answers[{text,is_correct}]) into src/data/trivia.json, skipping questions that
 * duplicate one already in the bank (same wording, ignoring case and punctuation) or listed in
 * --skip. Re-running replaces questions with the same id.
 *
 *   npx tsx scripts/import-trivia.ts questions.json categories.json [--skip t249,t271]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BONUS_QUESTIONS } from "../src/data/bonusQuestions";

type In = { id: string; category_id: string; category: string; difficulty: string; question: string; correct_answer: string; answers: { text: string; is_correct: boolean }[] };
export type TriviaRow = { id: string; categoryId: string; category: string; difficulty: "easy" | "medium" | "hard"; question: string; answers: string[]; correct: number };

const [file, catFile, ...rest] = process.argv.slice(2);
const skip = new Set((rest[rest.indexOf("--skip") + 1] ?? "").split(",").filter(Boolean));
const incoming = JSON.parse(readFileSync(file, "utf8")) as In[];
const categories = JSON.parse(readFileSync(catFile, "utf8")) as { id: string; name: string; emoji: string }[];
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const existing = new Set(BONUS_QUESTIONS.map((b) => key(b.question)));
const out: TriviaRow[] = [];
const report: string[] = [];
for (const q of incoming) {
  const answers = q.answers.map((a) => a.text.trim());
  const correct = q.answers.findIndex((a) => a.is_correct);
  const problem = skip.has(q.id)
    ? "skipped (duplicate)"
    : existing.has(key(q.question))
      ? "same question already in the bank"
      : q.answers.filter((a) => a.is_correct).length !== 1
        ? "needs exactly one right answer"
        : answers.length < 4 || answers.length > 12
          ? "needs 4–12 answers"
          : new Set(answers.map((a) => a.toLowerCase())).size !== answers.length
            ? "repeats an answer"
            : !["easy", "medium", "hard"].includes(q.difficulty)
              ? "unknown difficulty"
              : q.question.length > 300 || answers.some((a) => a.length > 80)
                ? "too long"
                : null;
  if (problem) {
    report.push(`${q.id}: ${problem} — ${q.question}`);
    continue;
  }
  existing.add(key(q.question));
  out.push({ id: q.id, categoryId: q.category_id, category: q.category, difficulty: q.difficulty as TriviaRow["difficulty"], question: q.question.trim(), answers, correct });
}
writeFileSync("src/data/trivia.json", JSON.stringify({ questions: out }, null, 1) + "\n");
writeFileSync("src/data/triviaCategories.json", JSON.stringify(categories, null, 1) + "\n");
console.log(`Imported ${out.length} of ${incoming.length}.`);
if (report.length) console.log(report.join("\n"));
