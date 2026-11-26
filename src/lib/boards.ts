/** The TV's rotating leaderboard pages, in the order they appear. */
export const BOARD_IDS = ["overall", "leader", "round", "reaction", "bets", "heating", "stumpers", "mystery", "galaxy", "graveyard"] as const;
export type BoardId = (typeof BOARD_IDS)[number];

export const DEFAULT_BOARDS: BoardId[] = ["overall", "leader", "round", "bets"];

export const BOARD_INFO: Record<BoardId, { label: string; title: string; about: string }> = {
  overall: { label: "Overall", title: "Leaderboard", about: "Everyone's score, leader in a spotlight" },
  leader: { label: "Leader", title: "Leader watch", about: "The leader's game and everyone's rank over time" },
  round: { label: "This round", title: "This round", about: "Who picked what, with earlier questions" },
  reaction: { label: "Reaction", title: "Reaction times", about: "Quick or slow, right or wrong" },
  bets: { label: "Bets", title: "Place your bets! 🏇", about: "A horse race with just-for-fun odds" },
  heating: { label: "Heating up", title: "Who's heating up? 🔥", about: "Everyone's last five answers" },
  stumpers: { label: "Stumpers", title: "The questions that stumped everyone", about: "Hardest questions and special badges" },
  mystery: { label: "Mystery", title: "The family mystery meter 🕵️", about: "Who's hardest to guess" },
  galaxy: { label: "Galaxy", title: "The family galaxy 🌌", about: "Speed vs. accuracy" },
  graveyard: { label: "Graveyard", title: "The answer graveyard 🪦", about: "Wrong answers that fooled the most people" },
};
