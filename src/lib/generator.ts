import { createRng, shuffle } from "./prng";
import { cleanText, nearDuplicate, normalizeKey } from "./text";

export type GenPlayer = { id: string; name: string };

export type GenAnswer = {
  playerPromptId: string;
  playerId: string;
  promptId: string;
  promptText: string;
  template: string;
  answer: string;
};

export type GenInput = {
  players: GenPlayer[];
  answers: GenAnswer[];
  /** Curated fallback distractors keyed by prompt id. */
  fallbackByPrompt: Record<string, string[]>;
  /** Optional extra distractors (e.g. from AI) keyed by player_prompt id. Never used as correct answers. */
  extraDistractors?: Record<string, string[]>;
  roundCount: number;
  reserveCount?: number;
  seed: number | string;
};

export type GenOption = { id: string; label: string };

export type GenRound = {
  subjectPlayerId: string;
  sourcePlayerPromptId: string;
  type: "WHAT_ANSWER" | "WHO_ANSWERED";
  questionText: string;
  promptText: string;
  answerText: string;
  options: GenOption[];
  correctOptionId: string;
  excludedPlayerIds: string[];
};

export type GenResult = {
  rounds: GenRound[];
  reserves: GenRound[];
  requested: number;
  /** Total number of distinct valid questions that could be built. */
  achievable: number;
  subjectCounts: Record<string, number>;
};

const UNUSUAL_WORDS = 5;
const UNUSUAL_CHARS = 40;

function isUnusual(answer: string): boolean {
  return answer.split(/\s+/).length > UNUSUAL_WORDS || answer.length > UNUSUAL_CHARS;
}

function optionIdFactory(rng: () => number) {
  const used = new Set<string>();
  return () => {
    let id = "";
    do {
      id = "o_" + Math.floor(rng() * 36 ** 6).toString(36).padStart(6, "0");
    } while (used.has(id));
    used.add(id);
    return id;
  };
}

/** Picks up to `count` distractors that are distinct from the answer and from each other. */
export function pickDistractors(
  correct: string,
  pools: string[][],
  count: number,
  blocked: string[] = [],
): { picked: string[]; fromPool: number[] } {
  const picked: string[] = [];
  const fromPool: number[] = [];
  for (let p = 0; p < pools.length && picked.length < count; p++) {
    for (const raw of pools[p]) {
      if (picked.length >= count) break;
      const candidate = cleanText(raw);
      if (!candidate || candidate.length > 120) continue;
      if (nearDuplicate(candidate, correct)) continue;
      if (picked.some((x) => nearDuplicate(x, candidate))) continue;
      if (blocked.some((b) => b && normalizeKey(candidate).includes(normalizeKey(b)))) continue;
      picked.push(candidate);
      fromPool.push(p);
    }
  }
  return { picked, fromPool };
}

function capitalizeFirst(s: string): string {
  return s ? s[0].toLocaleUpperCase("en-US") + s.slice(1) : s;
}

export function validateRound(round: GenRound, activePlayerIds: Set<string>): string | null {
  if (round.options.length !== 4) return "must have exactly four options";
  const ids = new Set(round.options.map((o) => o.id));
  if (ids.size !== 4) return "option ids must be unique";
  const labels = round.options.map((o) => normalizeKey(o.label));
  if (new Set(labels).size !== 4) return "option labels must be distinct";
  if (round.options.filter((o) => o.id === round.correctOptionId).length !== 1) {
    return "exactly one option must be correct";
  }
  if (!activePlayerIds.has(round.subjectPlayerId)) return "subject must be an active player";
  if (!round.excludedPlayerIds.includes(round.subjectPlayerId)) return "subject must sit out";
  if (!round.answerText.trim()) return "source answer missing";
  return null;
}

/**
 * Deterministic quiz generator. Never invents what a person said: the correct option is always
 * the exact submitted answer (Type A) or the exact submitter (Type B).
 */
export function generateQuiz(input: GenInput): GenResult {
  const rng = createRng(input.seed);
  const nextId = optionIdFactory(rng);
  const playersById = new Map(input.players.map((pl) => [pl.id, pl]));
  const activeIds = new Set(input.players.map((pl) => pl.id));
  const answers = input.answers
    .filter((a) => activeIds.has(a.playerId))
    .map((a) => ({ ...a, answer: cleanText(a.answer) }))
    .filter((a) => a.answer.length > 0);

  const byPrompt = new Map<string, typeof answers>();
  for (const a of answers) {
    const list = byPrompt.get(a.promptId) ?? [];
    list.push(a);
    byPrompt.set(a.promptId, list);
  }

  const canUseWho = input.players.length >= 4;
  const candidates = new Map<string, GenRound[]>();

  for (const a of answers) {
    const subject = playersById.get(a.playerId)!;
    const peers = (byPrompt.get(a.promptId) ?? []).filter((x) => x.playerId !== a.playerId);
    const peerAnswers = shuffle(peers.map((x) => x.answer), rng);
    const fallback = shuffle(input.fallbackByPrompt[a.promptId] ?? [], rng);
    const extra = input.extraDistractors?.[a.playerPromptId] ?? [];

    let round: GenRound | null = null;

    const { picked, fromPool } = pickDistractors(a.answer, [peerAnswers, fallback, extra], 3, [subject.name]);
    const realDistractors = fromPool.filter((p) => p === 0).length;
    const typeAOk = picked.length === 3 && !(isUnusual(a.answer) && realDistractors < 2);

    if (typeAOk) {
      const correct = { id: nextId(), label: capitalizeFirst(a.answer) };
      const options = shuffle(
        [correct, ...picked.map((label) => ({ id: nextId(), label: capitalizeFirst(label) }))],
        rng,
      );
      round = {
        subjectPlayerId: a.playerId,
        sourcePlayerPromptId: a.playerPromptId,
        type: "WHAT_ANSWER",
        questionText: a.template.replaceAll("{name}", subject.name),
        promptText: a.promptText,
        answerText: a.answer,
        options,
        correctOptionId: correct.id,
        excludedPlayerIds: [a.playerId],
      };
    } else if (canUseWho) {
      // Type B only when exactly one roster member gave this answer to this prompt.
      const unique = !peers.some((x) => nearDuplicate(x.answer, a.answer));
      if (unique) {
        const others = shuffle(input.players.filter((pl) => pl.id !== a.playerId), rng).slice(0, 3);
        if (others.length === 3) {
          const correct = { id: nextId(), label: subject.name };
          const options = shuffle([correct, ...others.map((o) => ({ id: nextId(), label: o.name }))], rng);
          round = {
            subjectPlayerId: a.playerId,
            sourcePlayerPromptId: a.playerPromptId,
            type: "WHO_ANSWERED",
            questionText: "Who submitted this answer?",
            promptText: a.promptText,
            answerText: a.answer,
            options,
            correctOptionId: correct.id,
            excludedPlayerIds: [a.playerId],
          };
        }
      }
    }

    if (round && validateRound(round, activeIds) === null) {
      const list = candidates.get(a.playerId) ?? [];
      list.push(round);
      candidates.set(a.playerId, list);
    }
  }

  // Per-player queues: "What is X's ...?" questions first, then "Who submitted ...?".
  const queues = new Map<string, GenRound[]>();
  for (const [pid, list] of candidates) {
    const a = shuffle(list.filter((r) => r.type === "WHAT_ANSWER"), rng);
    const b = shuffle(list.filter((r) => r.type === "WHO_ANSWERED"), rng);
    queues.set(pid, [...a, ...b]);
  }

  const achievable = [...queues.values()].reduce((n, q) => n + q.length, 0);
  const wanted = Math.min(achievable, input.roundCount + (input.reserveCount ?? 0));
  const order = shuffle([...queues.keys()], rng);
  const sequence: GenRound[] = [];

  // Round-robin across subjects keeps appearance counts within one of each other.
  while (sequence.length < wanted) {
    let cycle: GenRound[] = [];
    for (const pid of order) {
      const q = queues.get(pid)!;
      if (q.length) cycle.push(q.shift()!);
    }
    if (!cycle.length) break;
    cycle = shuffle(cycle, rng);
    const prev = sequence[sequence.length - 1];
    if (prev && cycle.length > 1 && cycle[0].subjectPlayerId === prev.subjectPlayerId) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }
    for (const r of cycle) {
      if (sequence.length < wanted) sequence.push(r);
    }
  }

  const mainCount = Math.min(input.roundCount, sequence.length);
  const rounds = sequence.slice(0, mainCount);
  const reserves = sequence.slice(mainCount);
  const subjectCounts: Record<string, number> = {};
  for (const pl of input.players) subjectCounts[pl.id] = 0;
  for (const r of rounds) subjectCounts[r.subjectPlayerId]++;

  return { rounds, reserves, requested: input.roundCount, achievable, subjectCounts };
}
