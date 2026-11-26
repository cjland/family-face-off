/**
 * Rough game-length planning for the setup screen and the start dialog. A question takes its
 * answer time plus about 30 seconds of countdown, announcer, reveal and leaderboard.
 */
export const OVERHEAD_SECONDS_PER_QUESTION = 30;
export const MAX_QUESTIONS = 80;

export function plannedQuestions(players: number, perPlayer: number) {
  return Math.min(MAX_QUESTIONS, Math.max(0, players) * perPlayer);
}

export function plannedMinutes(questions: number, questionSeconds: number) {
  return Math.max(1, Math.round((questions * (questionSeconds + OVERHEAD_SECONDS_PER_QUESTION)) / 60));
}

/** "about 35 minutes" / "about 1 hr 20 min" */
export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
