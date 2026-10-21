type Wave = OscillatorType;

/**
 * Tiny synthesised sound effects, so there are no audio files to load.
 * Off by default; browsers only allow audio after a user gesture anyway.
 */
export class Sfx {
  enabled = false;
  private ctx: AudioContext | null = null;

  private context(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: Wave, volume: number, slideTo?: number, delay = 0): void {
    const ctx = this.context();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** A wooden knock. */
  move(): void {
    this.tone(260, 0.09, 'triangle', 0.09, 140);
  }

  capture(): void {
    this.tone(190, 0.18, 'square', 0.05, 70);
    this.tone(640, 0.06, 'triangle', 0.05, 320);
  }

  check(): void {
    this.tone(520, 0.12, 'sine', 0.07);
    this.tone(660, 0.14, 'sine', 0.07, undefined, 0.1);
  }

  unlock(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.08, undefined, i * 0.09));
  }

  egg(): void {
    this.tone(880, 0.08, 'sine', 0.06);
    this.tone(1320, 0.14, 'sine', 0.06, undefined, 0.07);
  }
}
