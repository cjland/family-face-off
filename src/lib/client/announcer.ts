"use client";

/**
 * The game-show announcer: pre-recorded clips in public/audio (see manifest.json), played on the
 * TV only, through the TV's AudioContext so it shares the sound unlock and can dip the music.
 *
 * Each question: [lead-in] → [question number] during the 5-4-3-2-1 countdown, then
 * [the question] → [a "pick an answer" prompt] as the question appears.
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
};

export type Extra = "ten-seconds" | "times-up" | "all-locked" | "reveal" | "drumroll" | "game-over" | "game-over-2";

export class Announcer {
  private manifest: Manifest | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private last: Record<string, string | undefined> = {};
  private current: AudioBufferSourceNode | null = null;
  private token = 0; // bumps on every new sequence; stale sequences stop themselves
  private queue: Promise<void> = Promise.resolve();
  private speaking = 0;

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
    for (let i = 0; i < clips.length; i++) {
      if (token !== this.token) return;
      await this.play(clips[i], token);
      if (i < clips.length - 1) await new Promise((r) => setTimeout(r, this.manifest?.gapMs ?? 300));
    }
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

  /** During the countdown: "Here we go!" … "Question number three!" (numbers exist for 1–10). */
  async intro(number: number, total: number) {
    const m = await this.load();
    if (!m) return;
    const lead =
      number === 1 ? this.pick(m.leadin.first, "leadin") : number === total ? this.pick(m.leadin.final, "leadin") : this.pick(m.leadin.general, "leadin");
    return this.say([lead, m.number[String(number)] ?? null]);
  }

  /** As the question appears: the question itself, then a "pick an answer" prompt. */
  async question(promptId: string | null | undefined, withPrompt = true) {
    const m = await this.load();
    if (!m) return;
    const q = promptId ? (m.questions[promptId] ?? null) : null;
    return this.sayAfter([q, withPrompt ? this.pick(m.prompt, "prompt") : null]);
  }

  /** Preload a question's clips so there's no gap when it's time to speak. */
  async preload(promptId: string | null | undefined) {
    const m = await this.load();
    if (!m || !promptId || !m.questions[promptId]) return;
    void this.buffer(m.questions[promptId]);
  }

  async extra(name: Extra, interrupt = false) {
    const m = await this.load();
    const c = m?.extras[name];
    if (!c) return;
    return interrupt ? this.say([c]) : this.sayAfter([c]);
  }
}
