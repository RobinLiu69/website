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

  private drone: { stop(): void } | null = null;

  /**
   * A very low, slow hum under everything while sound is on: two close pitches and a filter that breathes.
   * Browsers hold audio back until the first press, so it starts then if it has to.
   */
  ambience(on: boolean): void {
    if (!on) {
      this.drone?.stop();
      this.drone = null;
      return;
    }
    const ctx = this.context();
    if (!ctx || this.drone) return;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoDepth.gain.value = 90;
    lfo.connect(lfoDepth).connect(filter.frequency);
    const oscillators = [55, 55.35, 82.4].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      return osc;
    });
    filter.connect(master).connect(ctx.destination);
    lfo.start();
    this.drone = {
      stop: () => {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        for (const node of [...oscillators, lfo]) node.stop(now + 0.9);
      },
    };
    // Until the first press the context may still be suspended; resume it then.
    const wake = (): void => {
      void ctx.resume();
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    if (ctx.state !== 'running') {
      window.addEventListener('pointerdown', wake);
      window.addEventListener('keydown', wake);
    }
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
