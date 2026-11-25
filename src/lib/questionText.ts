/**
 * Splits "How did Sam answer: “What would you drink?”" into the lead-in ("How did Sam answer:")
 * and the question itself, so screens can show the question big and the lead-in small.
 * Anything that doesn't follow that shape comes back as just the question.
 */
export function splitQuestion(text: string): { lead: string | null; question: string } {
  const m = /^(.{3,80}?:)\s*[“"]([\s\S]+)[”"]\s*$/.exec(text.trim());
  if (!m) return { lead: null, question: text };
  return { lead: m[1], question: m[2] };
}
