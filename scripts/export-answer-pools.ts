/**
 * Writes docs/answer-pools/answer-pools-to-expand.json: every question with its current answer
 * options, and how many more regular / humorous options to add to reach the target pool.
 *
 *   npx tsx scripts/export-answer-pools.ts [target=30]
 */
import { readFileSync, writeFileSync } from "node:fs";

type Q = { id: string; category: string; personal_question: string; active: boolean; seasonal: string | null; options: { id: string; text: string; is_humorous: boolean }[] };
const target = Number(process.argv[2] ?? 30);
const targetFunny = Math.round(target / 3);
const targetRegular = target - targetFunny;
const qs = JSON.parse(readFileSync("src/data/questions.json", "utf8")) as Q[];
const out = qs
  .filter((q) => q.active)
  .map((q) => {
    const regular = q.options.filter((o) => !o.is_humorous).map((o) => o.text);
    const humorous = q.options.filter((o) => o.is_humorous).map((o) => o.text);
    return {
      id: q.id,
      category: q.category,
      question: q.personal_question,
      seasonal: q.seasonal,
      regular,
      humorous,
      add_regular: Math.max(0, targetRegular - regular.length),
      add_humorous: Math.max(0, targetFunny - humorous.length),
    };
  });
writeFileSync("docs/answer-pools/answer-pools-to-expand.json", JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${out.length} questions (target ${targetRegular} regular + ${targetFunny} humorous).`);
