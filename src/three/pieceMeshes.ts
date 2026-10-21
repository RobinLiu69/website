import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Color, PieceType } from '../chess/types';
import { PALETTE } from '../theme';

/** Radial segments for every turned part. Few on purpose: this is the low-poly look. */
const SEGMENTS = 8;

/** [radius, height] pairs, bottom to top, closed back onto the axis. */
type Profile = ReadonlyArray<readonly [number, number]>;

interface Part {
  geometry: THREE.BufferGeometry;
  /** Painted with the piece's shade colour instead of its main colour. */
  shade?: boolean;
}

const lathe = (profile: Profile): THREE.BufferGeometry =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    SEGMENTS,
  );

const ball = (radius: number, y: number): THREE.BufferGeometry =>
  new THREE.IcosahedronGeometry(radius, 1).translate(0, y, 0);

const block = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

const FOOT: Profile = [
  [0.0, 0.0],
  [0.37, 0.0],
  [0.37, 0.06],
  [0.33, 0.12],
  [0.27, 0.17],
];

function pawn(): Part[] {
  return [
    {
      geometry: lathe([
        ...FOOT,
        [0.17, 0.24],
        [0.12, 0.4],
        [0.11, 0.48],
        [0.21, 0.52],
        [0.21, 0.58],
        [0.11, 0.62],
        [0.0, 0.62],
      ]),
    },
    { geometry: ball(0.19, 0.76) },
  ];
}

function rook(): Part[] {
  const merlons: Part[] = [];
  for (let k = 0; k < 4; k++) {
    const g = block(0.15, 0.15, 0.15, 0.2, 0.9, 0);
    g.rotateY(Math.PI / 4 + (k * Math.PI) / 2);
    merlons.push({ geometry: g });
  }
  return [
    {
      geometry: lathe([
        ...FOOT,
        [0.2, 0.24],
        [0.17, 0.6],
        [0.28, 0.67],
        [0.28, 0.83],
        [0.0, 0.83],
      ]),
    },
    ...merlons,
  ];
}

function bishop(): Part[] {
  // A tilted band round the head stands in for the mitre slit and reads from every side.
  const band = new THREE.CylinderGeometry(0.25, 0.25, 0.045, SEGMENTS).rotateZ(0.5).translate(0, 1.0, 0);
  return [
    {
      geometry: lathe([
        ...FOOT,
        [0.17, 0.24],
        [0.11, 0.46],
        [0.1, 0.56],
        [0.2, 0.6],
        [0.2, 0.66],
        [0.1, 0.7],
        [0.19, 0.8],
        [0.23, 0.96],
        [0.19, 1.12],
        [0.09, 1.26],
        [0.0, 1.3],
      ]),
    },
    { geometry: band, shade: true },
    { geometry: ball(0.07, 1.34) },
  ];
}

function queen(): Part[] {
  const spikes: Part[] = [];
  for (let k = 0; k < 8; k++) {
    const g = new THREE.ConeGeometry(0.065, 0.26, 4).translate(0, 0.13, 0);
    g.rotateZ(-0.22);
    g.translate(0.23, 1.42, 0);
    g.rotateY((k * Math.PI) / 4);
    spikes.push({ geometry: g });
  }
  return [
    {
      geometry: lathe([
        ...FOOT,
        [0.18, 0.24],
        [0.12, 0.5],
        [0.11, 0.78],
        [0.22, 0.84],
        [0.22, 0.9],
        [0.11, 0.96],
        [0.17, 1.08],
        [0.27, 1.28],
        [0.3, 1.42],
        [0.0, 1.42],
      ]),
    },
    ...spikes,
    { geometry: ball(0.1, 1.5) },
  ];
}

function king(): Part[] {
  return [
    {
      geometry: lathe([
        ...FOOT,
        [0.18, 0.24],
        [0.12, 0.5],
        [0.11, 0.9],
        [0.22, 0.96],
        [0.22, 1.02],
        [0.11, 1.08],
        [0.18, 1.2],
        [0.27, 1.4],
        [0.25, 1.52],
        [0.0, 1.52],
      ]),
    },
    { geometry: block(0.11, 0.38, 0.11, 0, 1.71, 0) },
    { geometry: block(0.32, 0.11, 0.11, 0, 1.76, 0) },
  ];
}

/** Side profile of the head and neck, looking along -z with the nose toward +x. */
const KNIGHT_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-0.24, 0.3], // back of the neck, where it leaves the base
  [-0.3, 0.52], // mane, stepping out and in
  [-0.24, 0.68],
  [-0.31, 0.88],
  [-0.22, 1.07],
  [-0.12, 1.28], // far ear
  [-0.02, 1.1],
  [0.1, 1.31], // near ear
  [0.17, 1.08], // forehead
  [0.36, 0.96], // bridge of the nose
  [0.52, 0.8],
  [0.54, 0.67], // muzzle
  [0.4, 0.61],
  [0.24, 0.65], // jaw
  [0.12, 0.57], // throat
  [0.2, 0.43], // chest
  [0.24, 0.3],
];

function knight(): Part[] {
  const shape = new THREE.Shape();
  KNIGHT_OUTLINE.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  // A deep chamfer gives the flat flanks a ridge to catch the light.
  const head = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.05,
    bevelSegments: 1,
    curveSegments: 1,
  });
  head.translate(0, 0, -0.1);
  // Modelled facing +x; BoardView turns each knight to face the centre of the board.
  return [
    { geometry: lathe([...FOOT, [0.23, 0.24], [0.22, 0.32], [0.0, 0.32]]) },
    { geometry: head },
  ];
}

function partsFor(type: PieceType): Part[] {
  switch (type) {
    case 'p':
      return pawn();
    case 'r':
      return rook();
    case 'n':
      return knight();
    case 'b':
      return bishop();
    case 'q':
      return queen();
    case 'k':
      return king();
  }
}

function bake(parts: Part[], color: Color): THREE.BufferGeometry {
  const main = new THREE.Color(color === 'w' ? PALETTE.white : PALETTE.black);
  const shade = new THREE.Color(color === 'w' ? PALETTE.whiteShade : PALETTE.blackShade);
  const prepared = parts.map(({ geometry, shade: useShade }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute('uv');
    const tint = useShade ? shade : main;
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(prepared);
  prepared.forEach((g) => g.dispose());
  parts.forEach((p) => p.geometry.dispose());
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Builds each piece shape once per colour and shares it between every piece on the board. */
export class PieceFactory {
  readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.82,
    metalness: 0,
  });

  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  geometry(type: PieceType, color: Color): THREE.BufferGeometry {
    const key = `${color}${type}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = bake(partsFor(type), color);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  create(type: PieceType, color: Color): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(type, color), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.geometries.clear();
    this.material.dispose();
  }
}
