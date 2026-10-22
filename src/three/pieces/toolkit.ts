import * as THREE from 'three';

/** Sides of every turned part. Few enough that the facets are the point of the shape. */
export const FACETS = 8;

/** Which tint of the piece's colour a part is painted with. */
export type Tone = 'main' | 'shade' | 'dark' | 'light';

export interface Part {
  geometry: THREE.BufferGeometry;
  tone?: Tone;
}

/**
 * One ring of a faceted turning: radius and height, then optionally whether the ring is turned half a
 * facet (so the band to its neighbour breaks into a zigzag of triangles, the way cut stone does), and
 * how far every second corner is raised (the points of a crown).
 */
export type Ring = readonly [r: number, y: number, half?: 0 | 1, lift?: number];

/** Turns a list of rings (bottom to top) into a faceted solid of revolution, flat shaded. */
export function turnFacet(rings: readonly Ring[], sides = FACETS): THREE.BufferGeometry {
  const step = (Math.PI * 2) / sides;
  const positions: number[] = [];

  const vertex = ([r, y, half = 0, lift = 0]: Ring, k: number): THREE.Vector3 => {
    const a = (k + half * 0.5) * step;
    return new THREE.Vector3(r * Math.sin(a), y + (k % 2 === 0 ? lift : 0), r * Math.cos(a));
  };

  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const outward = new THREE.Vector3();

  for (let i = 0; i + 1 < rings.length; i++) {
    const lower = rings[i] as Ring;
    const upper = rings[i + 1] as Ring;
    const dr = upper[0] - lower[0];
    const dy = upper[1] - lower[1];
    if (dr === 0 && dy === 0) continue;

    // Which way the band faces is fixed by how the profile runs: right of the direction of travel.
    const triangle = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3): void => {
      normal.crossVectors(edge1.subVectors(q, p), edge2.subVectors(r, p));
      if (normal.lengthSq() < 1e-10) return;
      const cx = (p.x + q.x + r.x) / 3;
      const cz = (p.z + q.z + r.z) / 3;
      const radial = Math.hypot(cx, cz) || 1;
      outward.set((dy * cx) / radial, -dr, (dy * cz) / radial);
      if (normal.dot(outward) < 0) [q, r] = [r, q];
      positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    };

    const lowerHalf = lower[2] ?? 0;
    const upperHalf = upper[2] ?? 0;
    for (let k = 0; k < sides; k++) {
      const a0 = vertex(lower, k);
      const a1 = vertex(lower, k + 1);
      const b0 = vertex(upper, k);
      const b1 = vertex(upper, k + 1);
      if (lowerHalf === upperHalf) {
        triangle(a0, a1, b1);
        triangle(a0, b1, b0);
      } else if (upperHalf) {
        // the upper corner k sits between lower corners k and k + 1
        triangle(a0, a1, b0);
        triangle(b0, a1, b1);
      } else {
        triangle(a0, b1, b0);
        triangle(a0, a1, b1);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** A faceted ball. */
export function ball(radius: number, x: number, y: number, z = 0, squash = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  if (squash !== 1) g.scale(1, squash, 1);
  return g.translate(x, y, z);
}

/** A pyramid standing on y = 0, apex up. */
export function pyramid(radius: number, height: number, sides = 4): THREE.BufferGeometry {
  return new THREE.ConeGeometry(radius, height, sides, 1).translate(0, height / 2, 0);
}

export type Pt2 = readonly [number, number];

/**
 * A flat outline pushed out into a slab and chamfered at the edges. The slab is
 * centred on z = 0 and is `depth + 2 * bevel` thick; `size` is how far the chamfer cuts in.
 */
export function slab(outline: readonly Pt2[], depth: number, bevel = 0.02, size = bevel): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: size,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A chamfered block centred on the origin. */
export function chamferBox(w: number, h: number, d: number, bevel = 0.012): THREE.BufferGeometry {
  const hw = Math.max(w / 2 - bevel, 0.001);
  const hh = Math.max(h / 2 - bevel, 0.001);
  return slab(
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ],
    Math.max(d - 2 * bevel, 0.001),
    bevel,
  );
}

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Where a ray along z at (x, y), coming from the given side (+1 front, -1 back), meets the geometry. */
export type SurfaceFinder = (x: number, y: number, side: number) => number | null;

export function surfaceFinder(geometry: THREE.BufferGeometry): SurfaceFinder {
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  return (x, y, side) => {
    raycaster.set(new THREE.Vector3(x, y, side * 3), new THREE.Vector3(0, 0, -side));
    return raycaster.intersectObject(mesh)[0]?.point.z ?? null;
  };
}

/**
 * A thin ribbon laid on a surface, on both its front (+z) and back (-z) sides, pointed at both ends.
 * Used for details that should look cut into the piece, such as a bishop's slit.
 * `angle` is the direction of the ribbon in the x-y plane and `width` its widest point.
 */
export function surfaceStrip(
  find: SurfaceFinder,
  options: { cx: number; cy: number; length: number; width: number; angle: number; lift?: number; steps?: number },
): THREE.BufferGeometry {
  const { cx, cy, length, width, angle, lift = 0.01, steps = 12 } = options;
  const dir = [Math.cos(angle), Math.sin(angle)] as const;
  const perp = [-Math.sin(angle), Math.cos(angle)] as const;
  const positions: number[] = [];

  const point = (s: number, side: number, face: 1 | -1): THREE.Vector3 | null => {
    const t = s / length + 0.5;
    const half = (width / 2) * Math.max(0.12, Math.sin(Math.PI * t) ** 0.7);
    const x = cx + dir[0] * s + perp[0] * side * half;
    const y = cy + dir[1] * s + perp[1] * side * half;
    const z = find(x, y, face);
    return z === null ? null : new THREE.Vector3(x, y, z + face * lift);
  };

  const push = (face: 1 | -1, p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3): void => {
    const n = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
    const [b, c] = n.z * face >= 0 ? [q, r] : [r, q];
    positions.push(p.x, p.y, p.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (const face of [1, -1] as const) {
    for (let i = 0; i < steps; i++) {
      const s0 = (i / steps - 0.5) * length;
      const s1 = ((i + 1) / steps - 0.5) * length;
      const a = point(s0, -1, face);
      const b = point(s0, 1, face);
      const c = point(s1, -1, face);
      const d = point(s1, 1, face);
      if (!a || !b || !c || !d) continue;
      push(face, a, b, c);
      push(face, b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
