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
  /** True when the answer is one of the question's curated options (never "unusual"). */
  curated?: boolean;
};

export type GenInput = {
  players: GenPlayer[];
  answers: GenAnswer[];
  /** Curated fallback distractors keyed by prompt id. */
  fallbackByPrompt: Record<string, string[]>;
  /** Optional extra distractors (e.g. from AI) keyed by player_prompt id. Never used as correct answers. */
  extraDistractors?: Record<string, string[]>;
  roundCount: number;
  /** Questions about each person. When set, overrides roundCount (players x perSubject, max 80). */
  perSubject?: number;
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
  const promptOf = new Map(answers.map((a) => [a.playerPromptId, a.promptId]));
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
    const typeAOk = picked.length === 3 && (a.curated || !(isUnusual(a.answer) && realDistractors < 2));

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

  // How many players hold each question: rare questions are used first so shared ones
  // (like the four everyone answers) remain available for others.
  const holders = new Map<string, number>();
  for (const list of candidates.values()) {
    for (const r of list) {
      const pid = promptOf.get(r.sourcePlayerPromptId)!;
      holders.set(pid, (holders.get(pid) ?? 0) + 1);
    }
  }
  const queues = new Map<string, GenRound[]>();
  for (const [pid, list] of candidates) {
    const shuffled = shuffle(list, rng);
    shuffled.sort(
      (x, y) =>
        (x.type === "WHAT_ANSWER" ? 0 : 1) - (y.type === "WHAT_ANSWER" ? 0 : 1) ||
        (holders.get(promptOf.get(x.sourcePlayerPromptId)!) ?? 0) - (holders.get(promptOf.get(y.sourcePlayerPromptId)!) ?? 0),
    );
    queues.set(pid, shuffled);
  }

  const cap = input.perSubject ?? Infinity;
  const roundTarget = input.perSubject ? Math.min(80, input.perSubject * input.players.length) : input.roundCount;
  const usedPrompts = new Set<string>();
  const counts = new Map<string, number>();
  const take = (pid: string, limit: number): GenRound | null => {
    if ((counts.get(pid) ?? 0) >= limit) return null;
    const q = queues.get(pid)!;
    const idx = q.findIndex((r) => !usedPrompts.has(promptOf.get(r.sourcePlayerPromptId)!));
    if (idx < 0) return null;
    const [r] = q.splice(idx, 1);
    usedPrompts.add(promptOf.get(r.sourcePlayerPromptId)!);
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
    return r;
  };
  const remainingFor = (pid: string) =>
    queues.get(pid)!.filter((r) => !usedPrompts.has(promptOf.get(r.sourcePlayerPromptId)!)).length;

  // Round-robin across subjects (most constrained first) keeps everyone's count within one,
  // and never asks the same question twice in a game.
  const pickCycles = (target: number, limit: number, into: GenRound[][]) => {
    let total = into.reduce((n, c) => n + c.length, 0);
    while (total < target) {
      const order = shuffle([...queues.keys()], rng).sort((a, b) => remainingFor(a) - remainingFor(b));
      const cycle: GenRound[] = [];
      for (const pid of order) {
        if (total >= target) break;
        const r = take(pid, limit);
        if (r) {
          cycle.push(r);
          total++;
        }
      }
      if (!cycle.length) break;
      into.push(cycle);
    }
  };

  const mainCycles: GenRound[][] = [];
  pickCycles(roundTarget, cap, mainCycles);
  const reserveCycles: GenRound[][] = [];
  if (input.reserveCount) pickCycles(input.reserveCount, Infinity, reserveCycles);

  const arrange = (cycles: GenRound[][], prevLast?: GenRound) => {
    const out: GenRound[] = [];
    for (let cycle of cycles) {
      cycle = shuffle(cycle, rng);
      const prev = out[out.length - 1] ?? prevLast;
      if (prev && cycle.length > 1 && cycle[0].subjectPlayerId === prev.subjectPlayerId) {
        [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
      }
      out.push(...cycle);
    }
    return out;
  };
  const sequence = arrange(mainCycles);
  const reserveSeq = arrange(reserveCycles, sequence[sequence.length - 1]);
  const achievable = new Set([...candidates.values()].flat().map((r) => promptOf.get(r.sourcePlayerPromptId)!)).size;

  const rounds = sequence;
  const reserves = reserveSeq.slice(0, input.reserveCount ?? 0);
  const subjectCounts: Record<string, number> = {};
  for (const pl of input.players) subjectCounts[pl.id] = 0;
  for (const r of rounds) subjectCounts[r.subjectPlayerId]++;

  return { rounds, reserves, requested: roundTarget, achievable: Math.min(achievable, 80), subjectCounts };
}

/**
 * Largest "questions per person" (1..8) for which every ready player can get that many
 * questions without any question being asked twice.
 */
export function maxPerSubject(input: Omit<GenInput, "perSubject" | "roundCount">): number {
  const n = input.players.length;
  if (!n) return 0;
  for (let k = Math.min(8, Math.floor(80 / n)); k >= 1; k--) {
    const r = generateQuiz({ ...input, roundCount: 0, perSubject: k, reserveCount: 0 });
    if (Object.values(r.subjectCounts).every((c) => c === k)) return k;
  }
  return 0;
}
