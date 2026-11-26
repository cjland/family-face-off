"use client";

import type { MusicStyle } from "@/lib/settings";

/**
 * Original background loops synthesized with WebAudio (no audio files, nothing copyrighted).
 * A small lookahead scheduler keeps timing tight. Only starts after a user gesture enabled sound.
 */

type Step = { bass?: number; notes?: number[]; lead?: number; kick?: boolean; hat?: boolean; tick?: boolean };
type Pattern = { bpm: number; swing: number; steps: Step[]; wave: OscillatorType; leadWave: OscillatorType };

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function gameshow(): Pattern {
  // Bright major loop: C – Am – F – G, bouncy bass and arpeggios.
  const chords = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ];
  const roots = [36, 33, 29, 31];
  const lead = [72, 76, 79, 76, 74, 72, 74, 76, 77, 76, 74, 72, 71, 74, 79, 0];
  const steps: Step[] = [];
  for (let bar = 0; bar < 4; bar++) {
    for (let i = 0; i < 16; i++) {
      const st: Step = { hat: i % 2 === 0, kick: i % 4 === 0 };
      if (i % 4 === 0) st.bass = roots[bar] + (i % 8 === 4 ? 12 : 0);
      if (i % 4 === 2) st.notes = chords[bar];
      if (i % 2 === 0 && bar % 2 === 1) st.lead = lead[(bar * 8 + i / 2) % lead.length] || undefined;
      steps.push(st);
    }
  }
  return { bpm: 128, swing: 0, steps, wave: "triangle", leadWave: "square" };
}

function suspense(): Pattern {
  // Ticking clock over a low minor pulse that creeps upward.
  const roots = [33, 33, 34, 35];
  const steps: Step[] = [];
  for (let bar = 0; bar < 4; bar++) {
    for (let i = 0; i < 16; i++) {
      const st: Step = { tick: i % 2 === 0 };
      if (i % 4 === 0) st.bass = roots[bar];
      if (i === 0) st.notes = [roots[bar] + 24, roots[bar] + 27, roots[bar] + 31];
      if (i === 12 && bar === 3) st.lead = 69;
      steps.push(st);
    }
  }
  return { bpm: 92, swing: 0, steps, wave: "sine", leadWave: "triangle" };
}

function lounge(): Pattern {
  // Swingy walking bass with soft seventh-chord stabs: Dm7 – G7 – Cmaj7 – A7.
  const walk = [38, 41, 45, 48, 43, 47, 50, 47, 36, 40, 43, 45, 45, 44, 43, 41];
  const chords = [
    [62, 65, 69, 72],
    [59, 62, 65, 67],
    [60, 64, 67, 71],
    [61, 64, 67, 69],
  ];
  const steps: Step[] = [];
  for (let bar = 0; bar < 4; bar++) {
    for (let i = 0; i < 16; i++) {
      const st: Step = { hat: i % 4 === 2 || i % 4 === 0 };
      if (i % 4 === 0) st.bass = walk[bar * 4 + i / 4];
      if (i === 6 || i === 14) st.notes = chords[bar];
      steps.push(st);
    }
  }
  return { bpm: 104, swing: 0.18, steps, wave: "sine", leadWave: "sine" };
}

const PATTERNS: Record<Exclude<MusicStyle, "off">, () => Pattern> = { gameshow, suspense, lounge };

export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private master: GainNode | null = null;
  private step = 0;
  private nextTime = 0;
  private pattern: Pattern | null = null;
  private noise: AudioBuffer | null = null;
  style: MusicStyle | null = null;
  private ducked = false;

  /** Normal music level, and the level while the announcer is talking (about 6 dB lower). */
  static readonly LEVEL = 0.5;
  static readonly DUCKED = 0.25;

  constructor(private ctx: AudioContext) {}

  private get level() {
    return this.ducked ? MusicPlayer.DUCKED : MusicPlayer.LEVEL;
  }

  /** Dip the music while the announcer speaks, and bring it back after. */
  duck(on: boolean) {
    if (this.ducked === on) return;
    this.ducked = on;
    if (!this.master) return;
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(this.level, t + (on ? 0.15 : 0.6));
  }

  get playing() {
    return this.timer !== null;
  }

  play(style: MusicStyle) {
    if (style === "off") return this.stop();
    if (this.playing && this.style === style) return;
    this.stop();
    this.style = style;
    this.pattern = PATTERNS[style]();
    this.master = this.ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(this.level, this.ctx.currentTime + 0.6);
    this.master.connect(this.ctx.destination);
    if (!this.noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.05);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.master) {
      const m = this.master;
      const t = this.ctx.currentTime;
      m.gain.cancelScheduledValues(t);
      m.gain.setValueAtTime(m.gain.value, t);
      m.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      setTimeout(() => m.disconnect(), 600);
    }
    this.master = null;
    this.style = null;
  }

  private schedule() {
    const p = this.pattern;
    if (!p || !this.master) return;
    const sixteenth = 60 / p.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const st = p.steps[this.step % p.steps.length];
      const swing = this.step % 2 === 1 ? p.swing * sixteenth : 0;
      this.playStep(st, this.nextTime + swing, sixteenth, p);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private voice(freq: number, t: number, dur: number, type: OscillatorType, gain: number) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hit(t: number, highpass: number, gain: number, dur: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = highpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  private playStep(st: Step, t: number, sixteenth: number, p: Pattern) {
    if (st.bass) this.voice(midi(st.bass), t, sixteenth * 3.2, "triangle", 0.35);
    if (st.notes) for (const n of st.notes) this.voice(midi(n), t, sixteenth * 1.8, p.wave, 0.07);
    if (st.lead) this.voice(midi(st.lead), t, sixteenth * 1.6, p.leadWave, 0.05);
    if (st.hat) this.hit(t, 7000, 0.06, 0.04);
    if (st.tick) this.hit(t, 3000, 0.12, 0.02);
    if (st.kick) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }
}
