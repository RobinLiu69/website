import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Color, PieceType } from '../chess/types';
import { PALETTE } from '../theme';
import { knight } from './pieces/knight';
import { bishop, king, pawn, queen, rook } from './pieces/staunton';
import { type Part, type Tone, smoothstep } from './pieces/toolkit';

const TONES: Record<Color, Record<Tone, number>> = {
  w: { main: PALETTE.white, shade: PALETTE.whiteShade, dark: PALETTE.whiteDark, light: PALETTE.whiteLight },
  b: { main: PALETTE.black, shade: PALETTE.blackShade, dark: PALETTE.blackDark, light: PALETTE.blackLight },
};

const BUILDERS: Record<PieceType, () => Part[]> = {
  p: pawn,
  r: rook,
  n: knight,
  b: bishop,
  q: queen,
  k: king,
};

/** The foot of a piece is a little darker, as if the pen had pressed harder where it meets the board. */
function paint(geometry: THREE.BufferGeometry, tone: THREE.Color): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const ground = 0.8 + 0.2 * smoothstep(0, 0.34, position.getY(i));
    colors[i * 3] = tone.r * ground;
    colors[i * 3 + 1] = tone.g * ground;
    colors[i * 3 + 2] = tone.b * ground;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function bake(parts: Part[], color: Color): THREE.BufferGeometry {
  const tones = Object.fromEntries(
    Object.entries(TONES[color]).map(([name, hex]) => [name, new THREE.Color(hex)]),
  ) as Record<Tone, THREE.Color>;

  // Every face stays flat: the facets are the shape.
  const prepared = parts.map(({ geometry, tone = 'main' }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    paint(g, tones[tone]);
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
  /** Brightness is all the drawing sees: the white pieces stay bare paper, the black ones get inked in. */
  readonly materials: Record<Color, THREE.MeshLambertMaterial> = {
    w: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    b: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };

  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  geometry(type: PieceType, color: Color): THREE.BufferGeometry {
    const key = `${color}${type}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = bake(BUILDERS[type](), color);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  create(type: PieceType, color: Color): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(type, color), this.materials[color]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.geometries.clear();
    this.materials.w.dispose();
    this.materials.b.dispose();
  }
}
