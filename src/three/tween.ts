export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
} satisfies Record<string, Ease>;

interface Tween {
  delay: number;
  elapsed: number;
  duration: number;
  ease: Ease;
  update: (t: number) => void;
  done: () => void;
}

export interface TweenOptions {
  delay?: number;
  ease?: Ease;
}

/**
 * Tiny frame-driven tween runner. Stepped from the render loop, so animations
 * stop when the tab is hidden and never fire from stray timers.
 */
export class Tweens {
  private active: Tween[] = [];

  /** When true every animation snaps to its end state (prefers-reduced-motion). */
  instant = false;

  get busy(): boolean {
    return this.active.length > 0;
  }

  run(duration: number, update: (t: number) => void, options: TweenOptions = {}): Promise<void> {
    if (this.instant) {
      update(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.active.push({
        delay: options.delay ?? 0,
        elapsed: 0,
        duration: Math.max(duration, 0.0001),
        ease: options.ease ?? ease.inOutCubic,
        update,
        done: resolve,
      });
    });
  }

  step(dt: number): void {
    if (this.active.length === 0) return;
    const finished: Tween[] = [];
    // Iterate over a snapshot: updates may start new tweens.
    for (const tween of [...this.active]) {
      if (tween.delay > 0) {
        tween.delay -= dt;
        if (tween.delay > 0) continue;
        tween.elapsed += -tween.delay;
        tween.delay = 0;
      } else {
        tween.elapsed += dt;
      }
      const t = Math.min(tween.elapsed / tween.duration, 1);
      tween.update(tween.ease(t));
      if (t >= 1) finished.push(tween);
    }
    if (finished.length > 0) {
      this.active = this.active.filter((t) => !finished.includes(t));
      for (const tween of finished) tween.done();
    }
  }

  /** Finish everything immediately (used when the scene is torn down). */
  flush(): void {
    const all = this.active;
    this.active = [];
    for (const tween of all) {
      tween.update(1);
      tween.done();
    }
  }
}
