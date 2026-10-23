import * as THREE from 'three';
import { MATING_PIECES, type MatingPiece, fileOf } from '../chess/types';
import { LOCKS, SPOKES } from '../game/locks';
import { PALETTE } from '../theme';
import { knightYaw, squareCenter } from './boardView';
import type { PieceFactory } from './pieceMeshes';
import { mulberry32, penCircle, penStroke } from './sketch/guides';

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec2 uTorch;
uniform float uTorchOn;
uniform vec2 uCentre;
uniform float uBreath;
uniform float uFlare;
uniform float uAlpha;
uniform vec3 uColor;
uniform vec3 uHot;
varying vec3 vWorld;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  // The whole figure comes out of the dark together, as the light nears the square it stands on.
  float lit = uTorchOn * (1.0 - smoothstep(0.7, 2.2, distance(uCentre, uTorch)));
  float grain = 0.55 + 0.45 * hash(floor(vWorld * 70.0));
  float shown = clamp(max(lit, uBreath) * uAlpha + uFlare, 0.0, 1.0);
  vec3 colour = mix(uColor, uHot, clamp(uFlare * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(colour, shown * grain);
  #include <colorspace_fragment>
}
`;

/** How far the light has to be from a ghost's square (in squares) to count as having seen it. */
const SEEN_DISTANCE = 1.0;
const FLOOR = 0.022;

interface Ghost {
  piece: MatingPiece;
  lines: THREE.LineSegments;
  material: THREE.ShaderMaterial;
  /** 0..1 pulse that shows the figure without any light, to catch the eye. */
  breath: number;
  breathAge: number;
  /** 0..1 flash when a door opens. */
  flare: number;
  seenFor: number;
  seen: boolean;
}

interface DrawnLine {
  line: THREE.Line;
  vertices: number;
  delay: number;
  duration: number;
}

/**
 * What the board is hiding. Each door has a ghost: the outline of the piece that opens it, standing on its
 * square, invisible until the light (the pointer, a finger, the keyboard cursor) comes close. Open doors leave
 * a ring on their square instead. When the four are open, four lines are drawn across the board from their
 * squares, and they all end on the fifth.
 */
export class Whispers {
  readonly root = new THREE.Group();
  /** Called the first time the light has stood over a ghost for a moment. */
  onSeen: ((piece: MatingPiece) => void) | null = null;

  private readonly ghosts = new Map<MatingPiece, Ghost>();
  private readonly rings = new Map<MatingPiece, THREE.Line>();
  private readonly lines: DrawnLine[] = [];
  private readonly chalk = new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.55, depthWrite: false });
  private readonly ember = new THREE.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.7, depthWrite: false });
  private readonly torch = { value: new THREE.Vector2(99, 99) };
  private readonly torchOn = { value: 0 };
  private readonly disposables: Array<{ dispose(): void }> = [];

  private open = new Set<MatingPiece>();
  private wanted = 0;
  private heldUntil = 0;
  private clock = 0;
  private nextBeckon = Infinity;
  private starClock = Infinity;
  private starInstant = false;

  constructor(
    factory: PieceFactory,
    private readonly random: () => number = Math.random,
  ) {
    this.root.name = 'whispers';
    const colour = new THREE.Color(PALETTE.ink);
    const hot = new THREE.Color(PALETTE.accentSoft);

    for (const piece of MATING_PIECES) {
      const lock = LOCKS[piece];
      const edges = new THREE.EdgesGeometry(factory.geometry(piece, 'w'), 14);
      const centre = squareCenter(lock.square, FLOOR);
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTorch: this.torch,
          uTorchOn: this.torchOn,
          uCentre: { value: new THREE.Vector2(centre.x, centre.z) },
          uBreath: { value: 0 },
          uFlare: { value: 0 },
          uAlpha: { value: 0.8 },
          uColor: { value: colour },
          uHot: { value: hot },
        },
      });
      const lines = new THREE.LineSegments(edges, material);
      lines.position.copy(centre);
      if (piece === 'n') lines.rotation.y = knightYaw(fileOf(lock.square));
      lines.frustumCulled = false;
      lines.renderOrder = 6;
      this.root.add(lines);
      this.ghosts.set(piece, { piece, lines, material, breath: 0, breathAge: Infinity, flare: 0, seenFor: 0, seen: false });
      this.disposables.push(edges, material);

      // The ring an open door leaves on its square.
      const random = mulberry32(31 + piece.charCodeAt(0));
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(penCircle(new THREE.Vector3(centre.x, FLOOR, centre.z), 0.38, random, 0.014, 1.08)), this.ember);
      ring.frustumCulled = false;
      ring.renderOrder = 7;
      ring.visible = false;
      this.root.add(ring);
      this.rings.set(piece, ring);
      this.disposables.push(ring.geometry);
    }
    this.buildStar();
    this.apply();
  }

  /** The lines from the four squares to the fifth: two strokes each, so they look drawn by hand. */
  private buildStar(): void {
    const random = mulberry32(2024);
    const queen = squareCenter(LOCKS.q.square, FLOOR);
    SPOKES.forEach((piece, i) => {
      const from = squareCenter(LOCKS[piece].square, FLOOR);
      // Stop a little short of each end, so the lines run between the pieces and not through them.
      const dir = queen.clone().sub(from).normalize();
      const a = from.clone().addScaledVector(dir, 0.42);
      const b = queen.clone().addScaledVector(dir, -0.42);
      for (const wobble of [0.012, 0.02]) {
        const points = penStroke(a, b, random, wobble);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, this.chalk);
        line.frustumCulled = false;
        line.renderOrder = 7;
        line.visible = false;
        this.root.add(line);
        this.lines.push({ line, vertices: points.length, delay: i * 0.5, duration: 1.3 });
        this.disposables.push(geometry);
      }
    });
    const ringPoints = penCircle(new THREE.Vector3(queen.x, FLOOR, queen.z), 0.4, random, 0.016, 1.08);
    const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ring = new THREE.Line(ringGeometry, this.ember);
    ring.frustumCulled = false;
    ring.renderOrder = 7;
    ring.visible = false;
    this.root.add(ring);
    this.lines.push({ line: ring, vertices: ringPoints.length, delay: 2.2, duration: 0.9 });
    this.disposables.push(ringGeometry);
  }

  /** Where the light is, in board units; null when it has gone. A brief light (a touch, a key) lingers for a moment. */
  setLight(point: { x: number; z: number } | null, brief: boolean): void {
    if (!point) {
      this.wanted = 0;
      return;
    }
    this.torch.value.set(point.x, point.z);
    this.wanted = 1;
    this.heldUntil = brief ? this.clock + 2.6 : Infinity;
  }

  /** Which doors are open. Their ghosts give way to a ring on the square. */
  setSolved(open: ReadonlySet<MatingPiece>): void {
    this.open = new Set(open);
    this.apply();
  }

  /** Every door but the last is open. */
  get starReady(): boolean {
    return SPOKES.every((piece) => this.open.has(piece));
  }

  get starShown(): boolean {
    return this.starClock !== Infinity;
  }

  /** Draws the lines to the queen's square, one after another, or all at once. */
  revealStar(instant = false): void {
    if (this.starShown) return;
    this.starClock = instant ? 1000 : 0;
    this.starInstant = instant;
    this.apply();
  }

  /** A door has just opened: its figure flares up once. */
  flare(piece: MatingPiece): void {
    const ghost = this.ghosts.get(piece);
    if (ghost) ghost.flare = 1;
  }

  /** Lets one figure show itself for a breath, without any light. */
  beckon(piece?: MatingPiece): void {
    const candidates = [...this.ghosts.values()].filter((g) => this.shows(g.piece));
    const ghost = piece ? this.ghosts.get(piece) : candidates[Math.floor(this.random() * candidates.length)];
    if (ghost) ghost.breathAge = 0;
  }

  /** Starts the occasional breath of an unfound figure, the first after `first` seconds. */
  arm(first: number): void {
    this.nextBeckon = this.clock + first;
  }

  /** Is this figure still hidden, and may it be found yet? */
  private shows(piece: MatingPiece): boolean {
    if (this.open.has(piece)) return false;
    return piece !== 'q' || this.starShown;
  }

  private apply(): void {
    for (const [piece, ghost] of this.ghosts) ghost.lines.visible = this.shows(piece);
    for (const [piece, ring] of this.rings) ring.visible = this.open.has(piece);
    const faded = this.open.has('q');
    this.chalk.opacity = faded ? 0.28 : 0.55;
    for (const drawn of this.lines) {
      const t = this.starClock === Infinity ? 0 : Math.min(1, Math.max(0, (this.starClock - drawn.delay) / drawn.duration));
      const eased = 1 - (1 - t) ** 2;
      drawn.line.geometry.setDrawRange(0, Math.round(drawn.vertices * eased));
      drawn.line.visible = t > 0;
    }
  }

  update(dt: number, time: number): void {
    this.clock = time;
    if (this.wanted === 1 && time > this.heldUntil) this.wanted = 0;
    this.torchOn.value += (this.wanted - this.torchOn.value) * (1 - Math.exp(-dt * 7));

    if (this.starClock !== Infinity && !this.starInstant && this.starClock < 6) {
      this.starClock += dt;
      this.apply();
    }

    if (time >= this.nextBeckon) {
      this.nextBeckon = time + 32 + this.random() * 26;
      if (this.torchOn.value < 0.2) this.beckon();
    }

    const torch = this.torch.value;
    for (const ghost of this.ghosts.values()) {
      const uniforms = ghost.material.uniforms as Record<string, THREE.IUniform<number>>;
      // A breath rises and falls over a few seconds.
      if (ghost.breathAge !== Infinity) {
        ghost.breathAge += dt;
        const t = ghost.breathAge / 3.2;
        ghost.breath = t >= 1 ? 0 : Math.sin(Math.PI * t) ** 2 * 0.5;
        if (t >= 1) ghost.breathAge = Infinity;
      }
      // The queen's figure keeps a faint pulse once the lines are drawn, until it is found.
      const waits = ghost.piece === 'q' && this.shows('q') ? 0.14 + 0.1 * Math.sin(time * 1.6) : 0;
      (uniforms['uBreath'] as THREE.IUniform<number>).value = Math.max(ghost.breath, waits);
      ghost.flare = Math.max(0, ghost.flare - dt * 0.7);
      (uniforms['uFlare'] as THREE.IUniform<number>).value = ghost.flare;
      // A door that has just opened shows its figure one last time, flaring.
      ghost.lines.visible = this.shows(ghost.piece) || ghost.flare > 0.01;

      if (!ghost.seen && this.shows(ghost.piece)) {
        const centre = (ghost.material.uniforms['uCentre'] as THREE.IUniform<THREE.Vector2>).value;
        const near = this.torchOn.value > 0.7 && Math.hypot(centre.x - torch.x, centre.y - torch.y) < SEEN_DISTANCE;
        ghost.seenFor = near ? ghost.seenFor + dt : 0;
        if (ghost.seenFor > 0.45) {
          ghost.seen = true;
          this.onSeen?.(ghost.piece);
        }
      }
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.chalk.dispose();
    this.ember.dispose();
  }
}
