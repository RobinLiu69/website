import * as THREE from 'three';
import { Sfx } from './audio';
import type { MatingPiece } from './chess/puzzles';
import type { Evaluation } from './chess/rules';
import { type Color, type Square, squareName } from './chess/types';
import type { SectionContext } from './content/loaders';
import { SECTIONS, type SectionId, sectionById, sectionForPiece } from './content/sections';
import { EGGS, type EggId } from './game/eggDefs';
import { EggEngine } from './game/eggEngine';
import { Game } from './game/game';
import { KONAMI, isTyping, watchKeys } from './game/keys';
import { createInterpreter } from './game/terminalCommands';
import { type Lang, detectLang, getLang, setLang, t } from './i18n';
import { Progress } from './state/progress';
import { PALETTE, applyCssTheme } from './theme';
import { BoardView, squareCenter } from './three/boardView';
import { type Pose, type Region, limitsAround } from './three/cameraRig';
import { Effects } from './three/effects';
import { InputController, type InputHost } from './three/input';
import { fitPoints } from './three/layout';
import { PieceFactory } from './three/pieceMeshes';
import { Dust } from './three/sketch/dust';
import { Guides } from './three/sketch/guides';
import { Stage } from './three/stage';
import { ease } from './three/tween';
import { h } from './ui/dom';
import { Hud, type HudState } from './ui/hud';
import { SidePanel, panelMetrics } from './ui/panel';
import { TerminalView } from './ui/terminal';
import { Banner, Toasts } from './ui/toast';

const IDLE_MS = 45_000;

/** Wires the 3D stage, the rules, the progress store and the HTML interface together. */
export class App {
  private readonly progress: Progress;
  private readonly stage: Stage;
  private readonly factory = new PieceFactory();
  private readonly board: BoardView;
  private readonly guides = new Guides();
  private readonly dust = new Dust();
  private readonly effects: Effects;
  private readonly game: Game;
  private readonly eggs: EggEngine;
  private readonly input: InputController;
  private readonly sfx = new Sfx();
  private readonly toasts: Toasts;
  private readonly banner: Banner;
  private readonly hud: Hud;
  private readonly panel: SidePanel;
  private readonly terminal: TerminalView;
  private readonly announcer = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite', role: 'status' } });

  /** The piece whose section is open in the panel, if any. */
  private reading: MatingPiece | null = null;
  private puzzleSolved = false;
  private cinematic = false;
  private signatureClicks = 0;
  private signatureTimer = 0;
  private riddlePokes = 0;
  private pokeTimer = 0;
  private idleTimer = 0;
  private idleFired = false;
  private unlockFlow = 0;
  private laidOut = { w: 0, h: 0 };
  private exposure = 1;
  private riddleUsed = false;

  constructor(private readonly root: HTMLElement) {
    applyCssTheme();
    this.progress = new Progress(detectLang());
    setLang(this.progress.lang);
    this.sfx.enabled = this.progress.sound;

    const stageHost = h('div', { class: 'stage' });
    root.append(stageHost);

    // Throws WebGLUnavailableError when there is no WebGL; main.ts shows a fallback.
    this.stage = new Stage(stageHost);
    this.board = new BoardView(this.stage.tweens, this.factory);
    this.effects = new Effects(this.stage);
    this.stage.scene.add(this.board.root, this.dust.points);
    this.stage.overlay.add(this.board.coordinates, this.guides.root);
    this.stage.sketch.setReveal(0);

    this.game = new Game(this.board, this.effects, this.stage);
    this.eggs = new EggEngine(this.progress, this.game);

    this.toasts = new Toasts(root.appendChild(h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } })));
    this.banner = new Banner(root.appendChild(h('div', { class: 'banner', attrs: { 'aria-hidden': 'true' } })));
    root.append(this.announcer);

    this.hud = new Hud(root, {
      reset: () => void this.resetBoard(),
      riddle: () => void this.nextRiddle(),
      toggleLang: () => this.toggleLang(),
      toggleSound: () => this.toggleSound(),
      puzzleRestart: () => void this.resetBoard(),
      puzzleLeave: () => void this.leavePuzzle(),
      signatureClick: () => this.signatureClick(),
      sigilClick: (piece) => this.onSigilClick(piece),
    });

    this.panel = new SidePanel(root, {
      context: () => this.sectionContext(),
      isUnlocked: (id) => this.progress.isUnlocked(sectionById(id).piece),
      navigate: (id) => void this.openSection(id),
      closed: () => this.onPanelClosed(),
    });

    this.terminal = new TerminalView(
      root,
      createInterpreter({
        isUnlocked: (id) => this.progress.isUnlocked(sectionById(id).piece),
        openSection: (id) => void this.openSection(id),
        sectionContext: () => this.sectionContext(),
        move: async (from, to) => !this.cinematic && (await this.game.move(from, to)),
        hasPiece: (square) => this.game.pieceAt(square) !== null,
        resetBoard: () => void this.resetBoard(),
        resetProgress: () => this.resetProgress(),
        setLang: (lang) => this.switchLang(lang),
        setSound: (on) => this.setSound(on),
        eggs: () => ({ found: this.progress.eggCount, total: EGGS.length }),
      }),
      {
        onOpen: () => {
          this.root.classList.add('terminal-open');
          this.input.cancelGesture();
          this.eggs.trigger('terminal');
        },
        onClose: () => this.root.classList.remove('terminal-open'),
      },
    );

    const inputHost: InputHost = {
      boardEnabled: () => this.reading === null && !this.game.busy && !this.cinematic,
      orbitEnabled: () => this.reading === null && !this.stage.rig.isFlying,
      move: (from, to) => void this.playMove(from, to),
      backgroundClick: () => {
        if (this.reading) this.panel.close();
      },
      touched: () => this.onActivity(),
      describeSquare: (square) => this.describeSquare(square),
      announce: (message) => this.announce(message),
    };
    this.input = new InputController(this.stage, this.board, inputHost);
    this.stage.renderer.domElement.setAttribute('aria-label', t('a11y.board'));

    this.wireGame();
    this.wireEggs();
    this.wireKeys();

    this.stage.onResize(() => this.layout());
    this.stage.onFrame((dt, time) => {
      this.guides.update(dt);
      this.dust.update(time);
    });
    this.progress.on('change', () => {
      this.hud.refresh(this.hudState());
      if (this.panel.section === 'secret') void this.panel.refresh();
    });
  }

  /** Test and debugging handle. */
  get debug(): Record<string, unknown> {
    return {
      game: this.game,
      progress: this.progress,
      stage: this.stage,
      board: this.board,
      effects: this.effects,
      eggs: this.eggs,
      openSection: (id: SectionId) => this.openSection(id),
    };
  }

  async start(): Promise<void> {
    this.layout(true);
    this.refreshAll();
    this.stage.start();
    document.querySelector('#boot')?.classList.add('done');

    // The drawing comes up out of the dark, from the middle outward, and the construction lines are drawn in.
    if (this.stage.reducedMotion) {
      this.stage.sketch.setReveal(1);
      this.board.setCoordinateOpacity(1);
      this.guides.complete();
    } else {
      this.guides.reveal();
      void this.stage.tweens.run(3.4, (t01) => this.stage.sketch.setReveal(t01), { ease: ease.inOutCubic });
      void this.stage.tweens.run(1.6, (t01) => this.board.setCoordinateOpacity(t01), { delay: 2.4, ease: ease.linear });
    }

    const rig = this.stage.rig;
    const home = rig.home;
    rig.snapTo(
      { target: home.target.clone(), yaw: 0.35, pitch: home.pitch + 0.2, dist: home.dist * 1.25 },
      rig.overviewLimits(),
    );
    void rig.flyTo(home, { duration: 2.6, limits: rig.overviewLimits() });
    this.root.classList.add('ready');
    if (this.progress.sound) this.sfx.ambience(true);
    // A visitor who has not found the riddle button after a while gets a nudge toward it.
    window.setTimeout(() => {
      if (!this.riddleUsed && this.game.mode.kind === 'sandbox' && !this.reading) this.hud.nudgeRiddle();
    }, 20_000);
    await this.game.begin(true);
    this.armIdle();
  }

  /* ----------------------------- layout ----------------------------- */

  /**
   * Re-fits the camera. ResizeObserver also reports the size it starts with, and acting on that
   * would cut the intro flight short, so an unchanged size is ignored.
   */
  private layout(force = false): void {
    const { w, h: height } = this.stage.size;
    if (!force && w === this.laidOut.w && height === this.laidOut.h) return;
    this.laidOut = { w, h: height };
    const portrait = w / height < 1.1;

    const margins = portrait ? { side: 0.06, top: 0.18, bottom: 0.2 } : { side: 0.14, top: 0.13, bottom: 0.15 };
    const rig = this.stage.rig;
    // Portrait screens have height to spare, so look down at the board from higher up.
    rig.fit(fitPoints(), margins, portrait ? 0.95 : undefined);

    const metrics = panelMetrics(w, height);
    this.root.style.setProperty('--panel-w', `${metrics.width}px`);
    this.root.style.setProperty('--panel-h', `${metrics.height}px`);
    this.root.dataset['panel'] = metrics.mode;

    if (this.reading) {
      const view = this.readerView();
      rig.snapTo(view.pose, limitsAround(view.pose, 0.14, 0.08, 0.15));
      void rig.setShift(view.shift.x, view.shift.y);
    } else {
      rig.snapTo(rig.home, rig.overviewLimits());
      void rig.setShift(0, 0);
    }
  }

  /** Where the camera stands while a page is open: the whole board, in the part of the screen the panel leaves free. */
  private readerView(): { pose: Pose; shift: { x: number; y: number } } {
    const { w, h: height } = this.stage.size;
    const metrics = panelMetrics(w, height);
    const rig = this.stage.rig;
    const pad = 0.06;
    let region: Region;
    if (metrics.mode === 'side') {
      const free = (w - metrics.width - 24) / w;
      region = { xMin: -1 + pad * 1.5, xMax: -1 + 2 * free - pad, yMin: -1 + 0.2, yMax: 1 - 0.18 };
    } else {
      const free = (height - metrics.height - 12) / height;
      region = { xMin: -1 + 0.06, xMax: 1 - 0.06, yMin: 1 - 2 * free + pad, yMax: 1 - 0.16 };
    }
    return rig.fitRegion(fitPoints(), region, rig.home.pitch, rig.home.target);
  }

  /** Lets the drawing recede (or come back) while a page is being read. */
  private async fadeDrawing(to: number): Promise<void> {
    const from = this.exposure;
    this.exposure = to;
    await this.stage.tweens.run(0.7, (t01) => this.stage.sketch.setExposure(from + (to - from) * t01), { ease: ease.inOutCubic });
  }

  /* ------------------------------ state ------------------------------ */

  private hudState(): HudState {
    const mode = this.game.mode;
    return {
      lang: getLang(),
      sound: this.progress.sound,
      unlocked: SECTIONS.map((section) => section.piece).filter((piece) => this.progress.isUnlocked(piece)),
      open: this.reading,
      puzzle: mode.kind === 'puzzle' ? { piece: mode.piece, solved: this.puzzleSolved } : null,
      finished: this.progress.unlockedCount === SECTIONS.length,
      sectionTitle: (id) => this.sectionTitle(id),
    };
  }

  private sectionContext(): SectionContext {
    return {
      lang: getLang(),
      unlockedCount: this.progress.unlockedCount,
      eggs: {
        found: this.progress.eggCount,
        total: EGGS.length,
        has: (id) => this.progress.hasEgg(id),
      },
    };
  }

  private sectionTitle(id: SectionId): string {
    return id === 'secret' ? t('section.secretOpen') : t(`section.${id}`);
  }

  private refreshAll(): void {
    this.hud.refresh(this.hudState());
    this.terminal.refreshText();
    this.stage.renderer.domElement.setAttribute('aria-label', t('a11y.board'));
    void this.panel.refresh();
  }

  private describeSquare(square: Square): string {
    const piece = this.game.pieceAt(square);
    const name = squareName(square);
    return piece
      ? t('a11y.piece', { square: name, side: t(`side.${piece.color}`), piece: t(`piece.${piece.type}`) })
      : t('a11y.empty', { square: name });
  }

  private announce(message: string): void {
    this.announcer.textContent = '';
    window.setTimeout(() => {
      this.announcer.textContent = message;
    }, 30);
  }

  /* --------------------------- preferences --------------------------- */

  private toggleLang(): void {
    this.switchLang(getLang() === 'zh-TW' ? 'en' : 'zh-TW');
  }

  private switchLang(lang: Lang): void {
    this.progress.setLang(lang);
    setLang(lang);
    this.refreshAll();
  }

  private toggleSound(): void {
    this.setSound(!this.progress.sound);
  }

  private setSound(on: boolean): void {
    this.progress.setSound(on);
    this.sfx.enabled = on;
    this.sfx.ambience(on);
    if (on) this.sfx.egg();
    this.hud.refresh(this.hudState());
  }

  private resetProgress(): void {
    this.progress.reset();
    if (this.panel.isOpen) this.panel.close();
    this.puzzleSolved = false;
    this.refreshAll();
    this.toasts.show(t('toast.progressReset'));
  }

  /* ----------------------------- the board ----------------------------- */

  private wireGame(): void {
    this.game.on('moved', () => {
      this.sfx.move();
      this.input.clearSelection();
      this.hud.showHint(false);
    });
    this.game.on('captured', () => this.sfx.capture());
    this.game.on('check', () => {
      this.sfx.check();
      this.toasts.show(t('status.check'), 'warn', 2200);
    });
    this.game.on('stalemate', () => this.toasts.show(t('status.stalemate'), 'info', 3200));
    this.game.on('noKing', ({ color }) => this.toasts.show(t('status.noKing', { side: t(`side.${color}`) }), 'info', 3200));
    this.game.on('checkmate', ({ pieces, mated, evaluation }) => void this.onCheckmate(pieces, mated, evaluation));
    this.game.on('mode', () => {
      this.puzzleSolved = false;
      this.hud.refresh(this.hudState());
    });
    this.game.on('reset', () => {
      this.puzzleSolved = false;
      this.hud.refresh(this.hudState());
    });
  }

  private async playMove(from: Square, to: Square): Promise<void> {
    const piece = this.game.pieceAt(from);
    const moved = await this.game.move(from, to);
    if (moved && piece) {
      this.announce(
        t('a11y.moved', {
          side: t(`side.${piece.color}`),
          piece: t(`piece.${piece.type}`),
          from: squareName(from),
          to: squareName(to),
        }),
      );
    }
  }

  private async resetBoard(): Promise<void> {
    if (this.reading) this.panel.close();
    this.input.clearSelection();
    await this.game.resetBoard();
    this.toasts.show(t('toast.reset'), 'info', 1800);
  }

  private async leavePuzzle(): Promise<void> {
    this.input.clearSelection();
    await this.game.leavePuzzle();
  }

  /* ------------------------ unlocking and panels ------------------------ */

  private async onCheckmate(pieces: MatingPiece[], mated: Color[], evaluation: Evaluation): Promise<void> {
    const first = pieces[0];
    if (!first) return;
    const mode = this.game.mode;
    if (mode.kind === 'puzzle' && pieces.includes(mode.piece)) this.puzzleSolved = true;

    this.banner.show(t('status.checkmateBy'), undefined, 2300);
    const fresh = pieces.filter((piece) => this.progress.unlock(piece));
    this.hud.refresh(this.hudState());
    this.celebrate(mated, evaluation, fresh.length > 0);

    if (fresh.length === 0) {
      this.sfx.check();
      this.toasts.show(t('toast.known'), 'info');
      return;
    }

    this.sfx.unlock();
    this.toasts.show(t('toast.unlocked'), 'unlock', 4200);
    const names = fresh.map((piece) => this.sectionTitle(sectionForPiece(piece).id)).join(' · ');
    this.announce(t('a11y.unlocked', { section: names }));
    if (this.progress.unlockedCount === SECTIONS.length) this.eggs.trigger('all-unlocked');

    // Let the king's last moment play out before the page opens over it.
    const flow = ++this.unlockFlow;
    await this.stage.tweens.run(1.9, () => {});
    if (flow !== this.unlockFlow || this.reading) return;
    void this.openSection(sectionForPiece(fresh[0] as MatingPiece).id);
  }

  /** Chalk dust and a ring on the floor where the king stood. */
  private celebrate(mated: Color[], evaluation: Evaluation, fresh: boolean): void {
    for (const color of mated) {
      const square = evaluation[color].kingSquare;
      this.effects.ripple(squareCenter(square, 0.02), PALETTE.accent, fresh ? 5.2 : 3.2);
      this.effects.confetti(squareCenter(square, 0.9), fresh ? 44 : 14);
    }
  }

  /** The riddle button: sets up the next position nobody has solved yet. The hidden page's riddle comes last. */
  private async nextRiddle(): Promise<void> {
    this.onActivity();
    this.riddleUsed = true;
    this.pokeRiddle();
    const open = SECTIONS.map((section) => section.piece).filter((piece) => !this.progress.isUnlocked(piece));
    const offered = open.filter((piece) => piece !== 'q' || open.length === 1);
    if (offered.length === 0) return;
    const mode = this.game.mode;
    const current = mode.kind === 'puzzle' ? mode.piece : null;
    const next = offered[(offered.indexOf(current as MatingPiece) + 1) % offered.length] as MatingPiece;
    if (this.reading) this.panel.close();
    this.input.clearSelection();
    if (current !== next) await this.game.loadPuzzle(next);
  }

  private pokeRiddle(): void {
    window.clearTimeout(this.pokeTimer);
    this.riddlePokes += 1;
    if (this.riddlePokes >= 8) {
      this.riddlePokes = 0;
      this.eggs.trigger('riddle-poke');
      return;
    }
    this.pokeTimer = window.setTimeout(() => {
      this.riddlePokes = 0;
    }, 6000);
  }

  private onSigilClick(piece: MatingPiece): void {
    this.onActivity();
    if (this.reading === piece) this.panel.close();
    else void this.openSection(sectionForPiece(piece).id);
  }

  private async openSection(id: SectionId): Promise<void> {
    const piece = sectionById(id).piece;
    if (!this.progress.isUnlocked(piece)) return;
    this.unlockFlow++;
    this.input.cancelGesture();
    this.input.clearSelection();

    const switching = this.reading !== null;
    this.reading = piece;
    this.root.classList.add('panel-open');
    this.hud.refresh(this.hudState());

    const view = this.readerView();
    void this.stage.rig.flyTo(view.pose, {
      duration: switching ? 0.7 : 1.25,
      shift: view.shift,
      limits: limitsAround(view.pose, 0.14, 0.08, 0.15),
    });
    void this.fadeDrawing(0.55);
    await this.panel.open(id);
    this.announce(t('a11y.panelOpen', { section: this.sectionTitle(id) }));
  }

  private onPanelClosed(): void {
    this.reading = null;
    this.root.classList.remove('panel-open');
    this.hud.refresh(this.hudState());
    const rig = this.stage.rig;
    void rig.flyTo(rig.home, { duration: 1.0, shift: { x: 0, y: 0 }, limits: rig.overviewLimits() });
    void this.fadeDrawing(1);
  }

  /* ------------------------------- eggs ------------------------------- */

  private wireEggs(): void {
    this.eggs.on('found', ({ id, fresh }) => {
      if (fresh) {
        this.sfx.egg();
        this.toasts.show(t(`egg.${id}.toast`), 'egg', 5200);
      }
      this.playEggEffect(id);
    });
  }

  private playEggEffect(id: EggId): void {
    switch (id) {
      case 'capture-black-king':
      case 'capture-white-king':
        this.effects.confetti(new THREE.Vector3(0, 1.2, 0), 70);
        break;
      case 'konami':
        void this.dance(true);
        break;
      case 'title-clicks':
      case 'idle':
        void this.dance(false);
        break;
      case 'all-unlocked':
        this.effects.confetti(new THREE.Vector3(0, 2.5, 0), 90);
        break;
      case 'promotion':
        this.effects.ripple(new THREE.Vector3(0, 0.05, 0), PALETTE.accentSoft, 6);
        break;
      default:
        break;
    }
  }

  /** Every piece hops in a wave. With `spin`, the whole board turns once as well. */
  private async dance(spin: boolean): Promise<void> {
    if (this.cinematic || this.stage.reducedMotion) return;
    this.cinematic = true;
    this.input.cancelGesture();
    this.input.clearSelection();
    const views = this.board.allViews();
    const loops = spin ? 5 : 3;
    await this.stage.tweens.run(
      spin ? 3.4 : 2.1,
      (t01) => {
        const envelope = Math.sin(Math.PI * t01);
        for (const view of views) {
          const file = view.square & 7;
          const rank = view.square >> 3;
          const phase = t01 * Math.PI * 2 * loops - file * 0.45 - rank * 0.2;
          view.object.position.y = Math.max(0, Math.sin(phase)) * 0.34 * envelope;
          view.object.rotation.y = Math.sin(phase * 0.5) * 0.22 * envelope;
        }
        if (spin) this.board.root.rotation.y = Math.PI * 2 * ease.inOutCubic(t01);
      },
      { ease: ease.linear },
    );
    for (const view of views) {
      view.object.position.y = 0;
      view.object.rotation.y = 0;
    }
    this.board.root.rotation.y = 0;
    this.cinematic = false;
  }

  private signatureClick(): void {
    window.clearTimeout(this.signatureTimer);
    this.signatureClicks += 1;
    if (this.signatureClicks >= 7) {
      this.signatureClicks = 0;
      this.eggs.trigger('title-clicks');
      return;
    }
    this.signatureTimer = window.setTimeout(() => {
      this.signatureClicks = 0;
    }, 1600);
  }

  /** Any press or key: the intro hint has done its job, and the idle clock starts over. */
  private onActivity(): void {
    this.hud.showHint(false);
    this.armIdle();
  }

  private armIdle(): void {
    window.clearTimeout(this.idleTimer);
    if (this.idleFired) return;
    this.idleTimer = window.setTimeout(() => {
      if (this.idleFired || this.panel.isOpen || this.terminal.isOpen) return;
      this.idleFired = true;
      this.eggs.trigger('idle');
    }, IDLE_MS);
  }

  private wireKeys(): void {
    watchKeys(
      window,
      [
        { keys: KONAMI, run: () => this.eggs.trigger('konami') },
        { keys: ['x', 'y', 'z', 'z', 'y'], run: () => this.eggs.trigger('xyzzy') },
        { keys: ['g', 'g'], run: () => this.eggs.trigger('gg') },
      ],
      () => this.terminal.isOpen,
    );

    window.addEventListener('keydown', (e) => {
      this.onActivity();
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        if (this.terminal.isOpen) this.terminal.close();
        else if (this.panel.isOpen) this.panel.close();
      } else if ((e.key === '`' || e.key === '~') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.terminal.toggle();
      }
    });
  }
}
