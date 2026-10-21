import * as THREE from 'three';
import { Sfx } from './audio';
import type { MatingPiece } from './chess/puzzles';
import { type Square, squareName } from './chess/types';
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
import { BoardView } from './three/boardView';
import { limitsAround } from './three/cameraRig';
import { Effects } from './three/effects';
import { InputController, type InputHost } from './three/input';
import { fitPoints, focusPose, layoutKindFor } from './three/layout';
import { PieceFactory } from './three/pieceMeshes';
import { Plinths } from './three/plinthView';
import { Stage } from './three/stage';
import { ease } from './three/tween';
import { h } from './ui/dom';
import { Hud, type HudState } from './ui/hud';
import { PlinthLabels } from './ui/labels';
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
  private readonly plinths: Plinths;
  private readonly effects: Effects;
  private readonly game: Game;
  private readonly eggs: EggEngine;
  private readonly input: InputController;
  private readonly sfx = new Sfx();
  private readonly toasts: Toasts;
  private readonly banner: Banner;
  private readonly hud: Hud;
  private readonly labels: PlinthLabels;
  private readonly panel: SidePanel;
  private readonly terminal: TerminalView;
  private readonly announcer = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite', role: 'status' } });

  /** The plinth whose section is open, if any. */
  private focus: MatingPiece | null = null;
  private puzzleSolved = false;
  private cinematic = false;
  private titleClicks = 0;
  private titleTimer = 0;
  private lockPokes = 0;
  private pokeTimer = 0;
  private idleTimer = 0;
  private idleFired = false;
  private unlockFlow = 0;

  constructor(private readonly root: HTMLElement) {
    applyCssTheme();
    this.progress = new Progress(detectLang());
    setLang(this.progress.lang);
    this.sfx.enabled = this.progress.sound;

    const stageHost = h('div', { class: 'stage' });
    const labelRoot = h('div', { class: 'labels' });
    root.append(stageHost, labelRoot);

    // Throws WebGLUnavailableError when there is no WebGL; main.ts shows a fallback.
    this.stage = new Stage(stageHost);
    this.board = new BoardView(this.stage.tweens, this.factory);
    this.plinths = new Plinths(this.factory, this.stage.tweens);
    this.effects = new Effects(this.stage);
    this.stage.scene.add(this.board.root, this.plinths.root);

    this.game = new Game(this.board, this.effects, this.stage);
    this.eggs = new EggEngine(this.progress, this.game);

    this.toasts = new Toasts(root.appendChild(h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } })));
    this.banner = new Banner(root.appendChild(h('div', { class: 'banner', attrs: { 'aria-hidden': 'true' } })));
    root.append(this.announcer);

    this.hud = new Hud(root, {
      reset: () => void this.resetBoard(),
      toggleLang: () => this.toggleLang(),
      toggleSound: () => this.toggleSound(),
      puzzleRestart: () => void this.resetBoard(),
      puzzleLeave: () => void this.leavePuzzle(),
      titleClick: () => this.titleClick(),
    });

    this.labels = new PlinthLabels(labelRoot, {
      plinthClick: (piece) => this.onPlinthClick(piece),
      plinthHover: (piece) => this.onPlinthHover(piece),
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
        move: (from, to) => this.game.move(from, to),
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
      boardEnabled: () => this.focus === null && !this.game.busy && !this.cinematic,
      orbitEnabled: () => this.focus === null && !this.stage.rig.isFlying,
      move: (from, to) => void this.playMove(from, to),
      plinthClick: (piece) => this.onPlinthClick(piece),
      plinthHover: (piece) => this.onPlinthHover(piece),
      backgroundClick: () => {
        if (this.focus) this.panel.close();
      },
      touched: () => this.onActivity(),
      describeSquare: (square) => this.describeSquare(square),
      announce: (message) => this.announce(message),
    };
    this.input = new InputController(this.stage, this.board, this.plinths, inputHost);
    this.stage.renderer.domElement.setAttribute('aria-label', t('a11y.board'));

    this.wireGame();
    this.wireEggs();
    this.wireKeys();

    this.stage.onResize(() => this.layout());
    this.stage.onFrame((dt, time) => {
      this.plinths.update(dt, time);
      const { w, h: height } = this.stage.size;
      this.labels.update(this.stage.rig.camera, this.plinths, w, height);
    });
    this.progress.on('change', () => {
      this.labels.refresh((p) => this.progress.isUnlocked(p));
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
      plinths: this.plinths,
      eggs: this.eggs,
      openSection: (id: SectionId) => this.openSection(id),
    };
  }

  async start(): Promise<void> {
    this.layout();
    this.syncPlinths();
    this.refreshAll();
    this.stage.start();
    document.querySelector('#boot')?.classList.add('done');

    const rig = this.stage.rig;
    const home = rig.home;
    rig.snapTo(
      { target: home.target.clone(), yaw: 0.35, pitch: home.pitch + 0.22, dist: home.dist * 1.3 },
      rig.overviewLimits(),
    );
    void rig.flyTo(home, { duration: 2.2, limits: rig.overviewLimits() });
    this.root.classList.add('ready');
    await this.game.begin(true);
    this.armIdle();
  }

  /* ----------------------------- layout ----------------------------- */

  private layout(): void {
    const { w, h: height } = this.stage.size;
    const aspect = w / height;
    const kind = layoutKindFor(aspect);
    if (kind !== this.plinths.layoutKind) this.plinths.layout(kind);

    const margins =
      kind === 'row' ? { side: 0.05, top: 0.2, bottom: 0.17 } : { side: 0.04, top: 0.22, bottom: 0.1 };
    const rig = this.stage.rig;
    // Portrait screens have height to spare, so look down at the board from higher up.
    rig.fit(fitPoints(kind), margins, kind === 'row' ? 0.95 : undefined);

    const metrics = panelMetrics(w, height);
    this.root.style.setProperty('--panel-w', `${metrics.width}px`);
    this.root.style.setProperty('--panel-h', `${metrics.height}px`);
    this.root.dataset['panel'] = metrics.mode;

    if (this.focus) {
      const pose = focusPose(this.focus, kind, metrics.mode === 'sheet');
      rig.snapTo(pose, limitsAround(pose, 0.14, 0.08, 0.15));
      const shift = this.panelShift();
      void rig.setShift(shift.x, shift.y);
    } else {
      rig.snapTo(rig.home, rig.overviewLimits());
      void rig.setShift(0, 0);
    }
  }

  private panelShift(): { x: number; y: number } {
    const { w, h: height } = this.stage.size;
    const metrics = panelMetrics(w, height);
    return metrics.mode === 'sheet'
      ? { x: 0, y: -(metrics.height + 12) / 2 }
      : { x: -(metrics.width + 24) / 2, y: 0 };
  }

  /* ------------------------------ state ------------------------------ */

  private hudState(): HudState {
    const mode = this.game.mode;
    return {
      lang: getLang(),
      sound: this.progress.sound,
      eggs: { found: this.progress.eggCount, total: EGGS.length },
      puzzle: mode.kind === 'puzzle' ? { piece: mode.piece, solved: this.puzzleSolved } : null,
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
    this.labels.refresh((p) => this.progress.isUnlocked(p));
    this.hud.refresh(this.hudState());
    this.terminal.refreshText();
    this.stage.renderer.domElement.setAttribute('aria-label', t('a11y.board'));
    void this.panel.refresh();
  }

  private syncPlinths(): void {
    for (const [piece, view] of this.plinths.views) void view.setLocked(!this.progress.isUnlocked(piece), false);
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
    if (on) this.sfx.egg();
    this.hud.refresh(this.hudState());
  }

  private resetProgress(): void {
    this.progress.reset();
    this.syncPlinths();
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
    this.game.on('checkmate', ({ pieces }) => void this.onCheckmate(pieces));
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
    if (this.focus) this.panel.close();
    this.input.clearSelection();
    await this.game.resetBoard();
    this.toasts.show(t('toast.reset'), 'info', 1800);
  }

  private async leavePuzzle(): Promise<void> {
    this.input.clearSelection();
    await this.game.leavePuzzle();
  }

  /* ------------------------ unlocking and panels ------------------------ */

  private async onCheckmate(pieces: MatingPiece[]): Promise<void> {
    const first = pieces[0];
    if (!first) return;
    const mode = this.game.mode;
    if (mode.kind === 'puzzle' && pieces.includes(mode.piece)) this.puzzleSolved = true;

    this.banner.show(t('status.checkmateBy', { piece: t(`piece.${first}`) }), undefined, 2300);
    const fresh = pieces.filter((piece) => this.progress.unlock(piece));
    this.hud.refresh(this.hudState());

    if (fresh.length === 0) {
      this.sfx.check();
      this.toasts.show(t('toast.known', { section: this.sectionTitle(sectionForPiece(first).id) }), 'info');
      return;
    }

    this.sfx.unlock();
    for (const piece of fresh) this.celebrate(piece);
    const names = fresh.map((piece) => this.sectionTitle(sectionForPiece(piece).id)).join(' · ');
    this.toasts.show(t('toast.unlocked', { section: names }), 'unlock', 5000);
    this.announce(t('a11y.unlocked', { section: names }));
    if (this.progress.unlockedCount === SECTIONS.length) this.eggs.trigger('all-unlocked');

    // Give the lock a moment to open before the camera leaves the board.
    const flow = ++this.unlockFlow;
    await this.stage.tweens.run(1.6, () => {});
    if (flow !== this.unlockFlow || this.focus) return;
    void this.openSection(sectionForPiece(fresh[0] as MatingPiece).id);
  }

  private celebrate(piece: MatingPiece): void {
    const view = this.plinths.views.get(piece);
    if (!view) return;
    void view.setLocked(false, true);
    void view.flash();
    const base = view.group.position;
    this.effects.ripple(new THREE.Vector3(base.x, -1.15, base.z), PALETTE.accent, 4.2);
    this.effects.confetti(view.tokenCenter, 44);
  }

  private onPlinthClick(piece: MatingPiece): void {
    this.onActivity();
    const section = sectionForPiece(piece);
    if (this.progress.isUnlocked(piece)) {
      if (this.focus === piece) this.panel.close();
      else void this.openSection(section.id);
      return;
    }

    const hint = piece === 'q' ? t('plinth.hintSecret') : t('plinth.hint', { piece: t(`piece.${piece}`) });
    this.toasts.show(t('toast.locked', { hint }), 'warn', 2800);
    this.pokeLock();
    const mode = this.game.mode;
    if (!(mode.kind === 'puzzle' && mode.piece === piece)) {
      this.input.clearSelection();
      void this.game.loadPuzzle(piece);
    }
  }

  private onPlinthHover(piece: MatingPiece | null): void {
    for (const [p, view] of this.plinths.views) view.setHover(p === piece);
    this.labels.setHover(piece);
  }

  private pokeLock(): void {
    window.clearTimeout(this.pokeTimer);
    this.lockPokes += 1;
    if (this.lockPokes >= 8) {
      this.lockPokes = 0;
      this.eggs.trigger('lock-poke');
      return;
    }
    this.pokeTimer = window.setTimeout(() => {
      this.lockPokes = 0;
    }, 6000);
  }

  private async openSection(id: SectionId): Promise<void> {
    const piece = sectionById(id).piece;
    if (!this.progress.isUnlocked(piece)) return;
    this.unlockFlow++;
    this.input.cancelGesture();
    this.input.clearSelection();

    const switching = this.focus !== null;
    this.focus = piece;
    this.root.classList.add('panel-open');
    this.labels.setActive(piece);
    this.labels.setDimmed(true);

    const { w, h: height } = this.stage.size;
    const metrics = panelMetrics(w, height);
    const pose = focusPose(piece, this.plinths.layoutKind, metrics.mode === 'sheet');
    void this.stage.rig.flyTo(pose, {
      duration: switching ? 0.9 : 1.25,
      shift: this.panelShift(),
      limits: limitsAround(pose, 0.14, 0.08, 0.15),
    });
    await this.panel.open(id);
    this.announce(t('a11y.panelOpen', { section: this.sectionTitle(id) }));
  }

  private onPanelClosed(): void {
    this.focus = null;
    this.root.classList.remove('panel-open');
    this.labels.setActive(null);
    this.labels.setDimmed(false);
    const rig = this.stage.rig;
    void rig.flyTo(rig.home, { duration: 1.0, shift: { x: 0, y: 0 }, limits: rig.overviewLimits() });
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

  private titleClick(): void {
    window.clearTimeout(this.titleTimer);
    this.titleClicks += 1;
    if (this.titleClicks >= 7) {
      this.titleClicks = 0;
      this.eggs.trigger('title-clicks');
      return;
    }
    this.titleTimer = window.setTimeout(() => {
      this.titleClicks = 0;
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
