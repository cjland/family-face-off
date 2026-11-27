/**
 * Merges expanded answer pools back into src/data/questions.json.
 *
 *   npx tsx scripts/import-answer-pools.ts path/to/expanded.json
 *
 * The file is the same shape as docs/answer-pools/answer-pools-to-expand.json, with longer
 * "regular" and "humorous" lists (the add_* fields are ignored). Existing options keep their ids;
 * new ones get the next ids (q001_7, q001_8…). Duplicates (ignoring case and punctuation),
 * blanks, and options over 40 characters are skipped and reported. Then rebuild neon-setup.sql:
 *   npx tsx scripts/build-setup-sql.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

type Opt = { id: string; text: string; is_humorous: boolean };
type Q = { id: string; options: Opt[] } & Record<string, unknown>;
type In = { id: string; regular?: string[]; humorous?: string[] };

const MAX_LEN = 40;
const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/import-answer-pools.ts expanded.json");
  process.exit(1);
}
const incoming = JSON.parse(readFileSync(file, "utf8")) as In[];
const questions = JSON.parse(readFileSync("src/data/questions.json", "utf8")) as Q[];
const byId = new Map(questions.map((q) => [q.id, q]));
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
let added = 0;
const problems: string[] = [];
for (const item of incoming) {
  const q = byId.get(item.id);
  if (!q) {
    problems.push(`${item.id}: no such question`);
    continue;
  }
  const seen = new Set(q.options.map((o) => key(o.text)));
  let next = Math.max(0, ...q.options.map((o) => Number(o.id.split("_").pop()) || 0)) + 1;
  for (const [list, funny] of [
    [item.regular ?? [], false],
    [item.humorous ?? [], true],
  ] as const) {
    for (const raw of list) {
      const text = String(raw ?? "").trim().replace(/\s+/g, " ");
      if (!text) continue;
      if (text.length > MAX_LEN) {
        problems.push(`${q.id}: too long (${text.length} chars): ${text}`);
        continue;
      }
      if (seen.has(key(text))) continue; // already there (existing options come back in the file too)
      seen.add(key(text));
      q.options.push({ id: `${q.id}_${next++}`, text, is_humorous: funny });
      added++;
    }
  }
}
writeFileSync("src/data/questions.json", JSON.stringify(questions, null, 1) + "\n");
console.log(`Added ${added} options.`);
if (problems.length) console.log(`Skipped:\n  ${problems.join("\n  ")}`);
const sizes = questions.map((q) => q.options.length);
console.log(`Pool sizes now: min ${Math.min(...sizes)}, max ${Math.max(...sizes)}.`);
