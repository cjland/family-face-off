"use client";

/**
 * The game-show announcer: pre-recorded clips in public/audio (see manifest.json), played on the
 * TV only, through the TV's AudioContext so it shares the sound unlock and can dip the music.
 *
 * Each question: [lead-in] → [question number] at the start of the 5-4-3-2-1 countdown, the
 * countdown numbers he has room for, then "Go!" → [the question] → [a "pick an answer" prompt]
 * as the question appears. Questions without a clip get a "read it on the screen" line instead.
 */
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
  countdown?: { intro: Clip[]; starting: Clip[]; numbers: Partial<Record<"5" | "4" | "3" | "2" | "1" | "go", Clip>> };
  leaderboard?: Clip[];
  "round-winner"?: Clip[];
  crown?: Clip[];
  "no-audio"?: Clip[];
};

export type Pool = "waiting" | "leaderboard" | "round-winner";

export type Extra = "ten-seconds" | "times-up" | "all-locked" | "reveal" | "drumroll" | "game-over" | "game-over-2";

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
      this.manifest = (await (await fetch("/audio/manifest.json")).json()) as Manifest;
    } catch {
      this.manifest = null;
    }
    return this.manifest;
  }

  private url(c: Clip) {
    return c.file.startsWith("http") ? c.file : (this.manifest?.basePath ?? "/audio/") + c.file;
  }

  /** Fetch + decode once; a missing clip resolves to null (never blocks the game). */
  private buffer(c: Clip) {
    const url = this.url(c);
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
        .then((b) => this.ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  private pick(pool: Clip[], key: string): Clip | null {
    if (!pool.length) return null;
    const options = pool.length > 1 ? pool.filter((c) => c.file !== this.last[key]) : pool;
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
        if (i < clips.length - 1) await new Promise((r) => setTimeout(r, this.manifest?.gapMs ?? 300));
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
   * Start of the countdown: "Things are heating up!" … "Question number three!" Numbers exist for
   * 1–10; after that he says "Get those phones ready…" instead.
   */
  async intro(number: number, total: number) {
    const m = await this.load();
    if (!m) return;
    const lead =
      number === 1 ? this.pick(m.leadin.first, "leadin") : number === total ? this.pick(m.leadin.final, "leadin") : this.pick(m.leadin.general, "leadin");
    const second = m.number[String(number)] ?? this.pick(m.countdown?.intro ?? [], "cd-intro");
    return this.say([lead, second]);
  }

  /** One countdown number, on the same clock as the big number on screen. Skipped if he's mid-line. */
  async count(n: 5 | 4 | 3 | 2 | 1) {
    const m = await this.load();
    const c = m?.countdown?.numbers[String(n) as "5"];
    if (!c || this.busy) return;
    void this.play(c, this.token);
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
  async line(pool: Pool, opts: { interrupt?: boolean; onlyIfQuiet?: boolean } = {}) {
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
