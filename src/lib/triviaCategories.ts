import categories from "@/data/triviaCategories.json";

/** Built-in trivia categories (names match bonus_questions.category). Safe for the browser. */
export const TRIVIA_CATEGORIES: { id: string; name: string; emoji: string }[] = categories;

/** Emoji for a trivia category name (🦃 for the Thanksgiving bonus set). */
export function triviaEmoji(category: string): string {
  return TRIVIA_CATEGORIES.find((c) => c.name === category)?.emoji ?? (category.includes("Thanksgiving") ? "🦃" : "❓");
}
