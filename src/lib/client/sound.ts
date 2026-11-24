"use client";

/**
 * Tiny synthesized sound effects (no audio files). Only created after a user gesture,
 * so browsers never block or auto-play sound.
 */
export class Sfx {
  private ctx: AudioContext | null = null;

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
  }

  get enabled() {
    return this.ctx !== null;
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

  tick() {
    this.tone(880, 0, 0.08, "square", 0.05);
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
