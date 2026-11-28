/**
 * Quiz types for Quiz mode: ready-made ones here, plus ones the host designs (saved in the
 * quiz_presets table). A quiz type sets the trivia categories, difficulty and number of questions.
 */
export const TRIVIA_DIFFICULTIES = ["mixed", "easy", "medium", "hard"] as const;
export type TriviaDifficulty = (typeof TRIVIA_DIFFICULTIES)[number];
export const DIFFICULTY_LABEL: Record<TriviaDifficulty, string> = { mixed: "Easy to hard", easy: "Easy only", medium: "Medium only", hard: "Hard only" };

export type QuizPreset = {
  id: string;
  name: string;
  emoji: string;
  about: string;
  /** Category names; empty = every category. */
  categories: string[];
  difficulty: TriviaDifficulty;
  questions: number;
  builtIn?: boolean;
};

export const BUILT_IN_QUIZZES: QuizPreset[] = [
  { id: "family-mix", name: "Family Mix", emoji: "🎉", about: "A bit of everything, easy to hard", categories: [], difficulty: "mixed", questions: 20 },
  { id: "quick-10", name: "Quick 10", emoji: "⚡", about: "Ten questions from anywhere: a short warm-up", categories: [], difficulty: "mixed", questions: 10 },
  { id: "sports-night", name: "Sports Night", emoji: "🏟️", about: "Football, basketball, baseball and the Olympics", categories: ["Football", "Basketball", "Baseball", "Olympics & Other Sports"], difficulty: "mixed", questions: 15 },
  { id: "movie-night", name: "Movie & TV Night", emoji: "🍿", about: "Movies, TV, Disney, cartoons and stars", categories: ["Movies", "Television", "Disney & Pixar", "Cartoons & Superheroes", "Famous People"], difficulty: "mixed", questions: 20 },
  { id: "kids-table", name: "Kids' Table", emoji: "🧒", about: "Easy questions the little ones can win", categories: ["Disney & Pixar", "Cartoons & Superheroes", "Animals & Wildlife", "Games & Toys", "Food & Drink", "Common Knowledge"], difficulty: "easy", questions: 15 },
  { id: "brainiac", name: "Brainiac", emoji: "🧠", about: "Hard science, space, history and tech", categories: ["Science & Discovery", "Space & Astronomy", "World History", "Technology & Inventions", "The Human Body"], difficulty: "hard", questions: 15 },
  { id: "history-buffs", name: "History Buffs", emoji: "📜", about: "American and world history, famous people, remember when", categories: ["American History", "World History", "Famous People", "Remember When?"], difficulty: "mixed", questions: 15 },
  { id: "globe-trotter", name: "Globe Trotter", emoji: "🌍", about: "Places, food, nature and animals around the world", categories: ["Around the World", "Food & Drink", "Nature & Weather", "Animals & Wildlife"], difficulty: "mixed", questions: 15 },
  { id: "music-memories", name: "Music & Memories", emoji: "🎵", about: "Songs through the decades, TV and things we remember", categories: ["Music Through the Decades", "Remember When?", "Brands & Slogans", "Television"], difficulty: "mixed", questions: 15 },
  { id: "puzzle-party", name: "Puzzle Party", emoji: "🧩", about: "Riddles, brain teasers, weird facts and words", categories: ["Riddles & Brain Teasers", "Weird but True", "Words, Books & Sayings", "Common Knowledge"], difficulty: "mixed", questions: 15 },
].map((q) => ({ ...q, builtIn: true }) as QuizPreset);

/** The settings a quiz type sets. */
export function quizSettings(q: QuizPreset) {
  return { mode: "quiz" as const, triviaCategories: q.categories, triviaDifficulty: q.difficulty, roundCount: q.questions, questionIds: [] as string[], quizName: `${q.emoji} ${q.name}` };
}
