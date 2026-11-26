"use client";

/**
 * The game-show announcer: pre-recorded clips in public/audio (see manifest.json), played on the
 * TV only, through the TV's AudioContext so it shares the sound unlock and can dip the music.
 *
 * Each question: [lead-in] → [question number] at the start of the 5-4-3-2-1 countdown, the
 * countdown numbers he has room for, then "Go!" → [the question] → [a "pick an answer" prompt]
 * as the question appears. Questions without a clip get a "read it on the screen" line instead.
 */
import {
  bonusIntroIndexes,
  hereComesKey,
  introIndex,
  introPool,
} from "@/lib/introClip";

type Clip = { file: string; durationMs: number; text: string };
type Manifest = {
  basePath: string;
  gapMs: number;
  number: Record<string, Clip>;
  leadin: { first: Clip[]; general: Clip[]; final: Clip[] };
  prompt: Clip[];
  extras: Record<string, Clip>;
  questions: Record<string, Clip>;
  waiting?: Clip[];
  countdown?: {
    intro: Clip[];
    starting: Clip[];
    numbers: Partial<Record<"5" | "4" | "3" | "2" | "1" | "go", Clip>>;
  };
  leaderboard?: Clip[];
  "round-winner"?: Clip[];
  crown?: Clip[];
  "no-audio"?: Clip[];
  bonus?: {
    intro: Clip[];
    easy: Clip[];
    medium: Clip[];
    hard: Clip[];
    reveal: Clip[];
  };
  hereComes?: { first: Clip; last: Clip; number: Record<string, Clip> };
};

export type Pool = "waiting" | "leaderboard" | "round-winner";

export type Extra =
  | "ten-seconds"
  | "times-up"
  | "all-locked"
  | "reveal"
  | "drumroll"
  | "game-over"
  | "game-over-2";

export class Announcer {
  private manifest: Manifest | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private last: Record<string, string | undefined> = {};
  private current: AudioBufferSourceNode | null = null;
  private token = 0; // bumps on every new sequence; stale sequences stop themselves
  private queue: Promise<void> = Promise.resolve();
  private speaking = 0;
  private running = 0; // sequences in progress, including the gaps between clips

  constructor(
    private ctx: AudioContext,
    private onSpeaking: (speaking: boolean) => void = () => {},
  ) {}

  async load() {
    if (this.manifest) return this.manifest;
    try {
      this.manifest = (await (
        await fetch("/audio/manifest.json")
      ).json()) as Manifest;
      // Decode the countdown numbers and the "get ready" lines up front, so nothing waits on a
      // download when it's time to speak (on the live site that can take most of a second).
      const m = this.manifest;
      [
        ...Object.values(m.countdown?.numbers ?? {}),
        ...(m.countdown?.intro ?? []),
        ...m.leadin.first,
        m.hereComes?.first,
        m.hereComes?.last,
        m.hereComes?.number["2"],
        ...(m.bonus
          ? [
              ...m.bonus.intro,
              ...m.bonus.easy,
              ...m.bonus.medium,
              ...m.bonus.hard,
              ...m.bonus.reveal,
            ]
          : []),
      ].forEach((c) => c && void this.buffer(c));
    } catch {
      this.manifest = null;
    }
    return this.manifest;
  }

  private url(c: Clip) {
    return c.file.startsWith("http")
      ? c.file
      : (this.manifest?.basePath ?? "/audio/") + c.file;
  }

  /** Fetch + decode once; a missing clip resolves to null (never blocks the game). */
  private buffer(c: Clip) {
    const url = this.url(c);
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) =>
          r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing")),
        )
        .then((b) => this.ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  private pick(pool: Clip[], key: string): Clip | null {
    if (!pool.length) return null;
    const options =
      pool.length > 1 ? pool.filter((c) => c.file !== this.last[key]) : pool;
    const c = options[Math.floor(Math.random() * options.length)];
    this.last[key] = c.file;
    return c;
  }

  private setSpeaking(delta: number) {
    const before = this.speaking > 0;
    this.speaking = Math.max(0, this.speaking + delta);
    const after = this.speaking > 0;
    if (before !== after) this.onSpeaking(after);
  }

  private play(c: Clip, token: number): Promise<void> {
    return this.buffer(c).then(
      (buf) =>
        new Promise<void>((resolve) => {
          if (!buf || token !== this.token) return resolve();
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          src.connect(this.ctx.destination);
          this.current = src;
          this.setSpeaking(1);
          src.onended = () => {
            this.setSpeaking(-1);
            if (this.current === src) this.current = null;
            resolve();
          };
          src.start();
        }),
    );
  }

  private async run(seq: (Clip | null)[], token: number) {
    const clips = seq.filter((c): c is Clip => Boolean(c));
    clips.forEach((c) => void this.buffer(c)); // fetch them all in parallel
    this.running++;
    try {
      for (let i = 0; i < clips.length; i++) {
        if (token !== this.token) return;
        await this.play(clips[i], token);
        if (i < clips.length - 1)
          await new Promise((r) => setTimeout(r, this.manifest?.gapMs ?? 300));
      }
    } finally {
      this.running--;
    }
  }

  /** True while he's talking (or pausing between clips of one line). */
  get busy() {
    return this.running > 0 || this.speaking > 0;
  }

  /** Stop whatever is playing and forget anything queued. */
  stop() {
    this.token++;
    try {
      this.current?.stop();
    } catch {
      /* already stopped */
    }
    this.current = null;
    this.queue = Promise.resolve();
  }

  /** Replace anything playing with this sequence. */
  private say(seq: (Clip | null)[]) {
    this.stop();
    const token = this.token;
    this.queue = this.run(seq, token);
    return this.queue;
  }

  /** Play after whatever is already being said (for call-outs that shouldn't cut a question off). */
  private sayAfter(seq: (Clip | null)[]) {
    const token = this.token;
    this.queue = this.queue.then(() => this.run(seq, token));
    return this.queue;
  }

  /**
   * The "Get ready!" moment before the 5-4-3-2-1: "I hope everyone's ready…" (or "Let the fun
   * begin!" for question 1), then "Okay, here comes question twelve!" (or "…the first/last
   * question!"). The server picked the same clips and holds the countdown until he's done.
   */
  async intro(
    code: string,
    number: number,
    total: number,
    untilCountdownMs: number,
  ) {
    const t0 = performance.now();
    const m = await this.load();
    if (!m) return;
    const kind = introPool(number, total);
    const pool = kind === "first" ? m.leadin.first : (m.countdown?.intro ?? []);
    const warm = pool[introIndex(code, number, pool.length)] ?? null;
    const hc = this.hereComes(m, number, total);
    return this.fitted(warm, hc, untilCountdownMs, t0);
  }

  private hereComes(m: Manifest, number: number, total: number): Clip | null {
    const k = hereComesKey(number, total);
    return (
      (k && m.hereComes
        ? "special" in k
          ? m.hereComes[k.special]
          : m.hereComes.number[k.number]
        : null) ?? null
    );
  }

  /** Download the "here comes question N" clip ahead of time (call while the previous question is up). */
  async preloadIntro(number: number, total: number) {
    const m = await this.load();
    const c = m ? this.hereComes(m, number, total) : null;
    if (c) void this.buffer(c);
  }

  /**
   * Says `first` then `main` if both fit before the countdown starts. If the TV noticed the
   * question late, drops `first` so the important line ("here comes question N") still gets
   * said in full rather than being cut off by "Five!".
   */
  private async fitted(
    first: Clip | null,
    main: Clip | null,
    untilCountdownMs: number,
    t0: number,
  ) {
    await Promise.all([first, main].map((c) => (c ? this.buffer(c) : null)));
    const left = untilCountdownMs - (performance.now() - t0) - 150;
    const gap = this.manifest?.gapMs ?? 300;
    const len = (c: Clip | null) => (c ? c.durationMs : 0);
    if (len(first) + (first && main ? gap : 0) + len(main) <= left)
      return this.say([first, main]);
    if (main && len(main) <= left) return this.say([main]);
    if (first && len(first) <= left) return this.say([first]);
  }

  /**
   * Bonus round "Get ready!": "It's time for a bonus question!" then the difficulty line. Same
   * clips the server timed the countdown for.
   */
  async bonusIntro(
    code: string,
    ordinal: number,
    difficulty: "easy" | "medium" | "hard",
    untilCountdownMs: number,
  ) {
    const t0 = performance.now();
    const m = await this.load();
    const b = m?.bonus;
    if (!b) return;
    const diff = b[difficulty] ?? [];
    const i = bonusIntroIndexes(code, ordinal, b.intro.length, diff.length);
    return this.fitted(
      b.intro[i.intro] ?? null,
      diff[i.difficulty] ?? null,
      untilCountdownMs,
      t0,
    );
  }

  /** Bonus reveal: "Let's see who got it right!" */
  async bonusReveal() {
    const m = await this.load();
    const c = this.pick(m?.bonus?.reveal ?? [], "bonus-reveal");
    if (c) return this.say([c]);
  }

  /**
   * One countdown number, called the moment that number appears on the TV so voice and screen
   * stay together. Always plays: it cuts off anything still being said.
   */
  async count(n: number) {
    const m = await this.load();
    const c = m?.countdown?.numbers[String(n) as "5"];
    if (!c) return;
    void this.say([c]);
  }

  /** As the question appears: "Go!", the question itself, then a "pick an answer" prompt. */
  async question(promptId: string | null | undefined, withPrompt = true) {
    const m = await this.load();
    if (!m) return;
    const q = promptId ? (m.questions[promptId] ?? null) : null;
    return this.sayAfter([
      m.countdown?.numbers.go ?? null,
      q ?? this.pick(m["no-audio"] ?? [], "no-audio"),
      withPrompt ? this.pick(m.prompt, "prompt") : null,
    ]);
  }

  /** A random line from one of the game-flow pools. Returns false if nothing was played. */
  async line(
    pool: Pool,
    opts: { interrupt?: boolean; onlyIfQuiet?: boolean } = {},
  ) {
    const m = await this.load();
    const c = this.pick(m?.[pool] ?? [], pool);
    if (!c || (opts.onlyIfQuiet && this.busy)) return false;
    void (opts.interrupt ? this.say([c]) : this.sayAfter([c]));
    return true;
  }

  /** Start of the awards: "Are we ready to crown our winner?" (any crown line but the last). */
  async crown() {
    const m = await this.load();
    const pool = (m?.crown ?? []).filter((c) => !c.file.includes("04"));
    return this.say([this.pick(pool, "crown")]);
  }

  /**
   * "And your Family Face-Off champion is..." Resolves when he finishes (or straight away if
   * the clip is missing), so the podium can appear right on the beat.
   */
  async champion() {
    const m = await this.load();
    const c = (m?.crown ?? []).find((x) => x.file.includes("04"));
    if (!c) return;
    this.stop();
    await this.run([c], this.token);
  }

  /** Preload a question's clips so there's no gap when it's time to speak. */
  async preload(promptId: string | null | undefined) {
    const m = await this.load();
    if (!m) return;
    const go = m.countdown?.numbers.go;
    if (go) void this.buffer(go);
    if (!promptId || !m.questions[promptId]) return;
    void this.buffer(m.questions[promptId]);
  }

  async extra(name: Extra, interrupt = false) {
    const m = await this.load();
    const c = m?.extras[name];
    if (!c) return;
    return interrupt ? this.say([c]) : this.sayAfter([c]);
  }
}
