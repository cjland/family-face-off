"use client";

/**
 * Sound effects: mostly synthesized, plus a few short recorded clips in public/sounds.
 * Only created after a user gesture, so browsers never block or auto-play sound.
 */
export const CLIPS = { hurryUp: "/sounds/hurry-up.mp3" } as const;
export type ClipName = keyof typeof CLIPS;

export class Sfx {
  private ctx: AudioContext | null = null;
  private clips = new Map<ClipName, AudioBuffer>();

  /** Fetches and decodes the recorded clips (TV only; phones don't need them). */
  async preloadClips() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      (Object.keys(CLIPS) as ClipName[]).map(async (name) => {
        if (this.clips.has(name)) return;
        try {
          const res = await fetch(CLIPS[name]);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.clips.set(name, buf);
        } catch {
          /* a missing clip just means silence */
        }
      }),
    );
  }

  private playClip(name: ClipName, gain = 1): boolean {
    const buf = this.clips.get(name);
    if (!this.ctx || !buf) return false;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g).connect(this.ctx.destination);
    src.start();
    return true;
  }

  /** "Hurry up!" voice clip, repeated during the SHAME ALERT. */
  hurryUp() {
    return this.playClip("hurryUp", 1);
  }

  enable(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    void this.ctx.resume();
    return true;
  }

  disable() {
    void this.ctx?.close();
    this.ctx = null;
    this.clips.clear();
  }

  get enabled() {
    return this.ctx !== null;
  }

  /** True once the browser actually lets us play (after a user gesture, or if it trusts the site). */
  async unlock(): Promise<boolean> {
    if (!this.ctx && !this.enable()) return false;
    try {
      await this.ctx!.resume();
    } catch {
      /* still blocked */
    }
    return this.ctx?.state === "running";
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.15) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Bubbly pop when someone locks in; pitch climbs as more people lock. */
  lockIn(step = 0) {
    if (!this.ctx) return;
    const base = 520 * Math.pow(2, (step % 12) / 12);
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.exponentialRampToValueAtTime(base * 2, t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  /** Wailing siren for the SHAME ALERT. */
  shame() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    for (let i = 0; i < 4; i++) {
      osc.frequency.setValueAtTime(620, t0 + i * 0.4);
      osc.frequency.linearRampToValueAtTime(940, t0 + i * 0.4 + 0.2);
      osc.frequency.linearRampToValueAtTime(620, t0 + i * 0.4 + 0.4);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05);
    g.gain.setValueAtTime(0.09, t0 + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.65);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.7);
  }

  tick() {
    this.tone(880, 0, 0.08, "square", 0.05);
  }
  /**
   * The last 5 seconds of a question: a loud, game-show style beep that gets higher and
   * longer as time runs out (5-4 mid, 3-2 high, 1 highest and longest).
   */
  finalBeep(secsLeft: number) {
    const f = secsLeft >= 4 ? 988 : secsLeft >= 2 ? 1175 : 1568;
    const dur = secsLeft <= 1 ? 0.45 : 0.2;
    this.tone(f, 0, dur, "square", 0.16);
    this.tone(f * 2, 0, dur * 0.8, "sine", 0.08);
    this.tone(f / 2, 0, dur, "triangle", 0.12);
  }
  question() {
    this.tone(523, 0, 0.15, "triangle");
    this.tone(784, 0.12, 0.25, "triangle");
  }
  reveal() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.3, "triangle", 0.12));
  }
  fanfare() {
    [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.14, 0.35, "sawtooth", 0.07));
  }
}
