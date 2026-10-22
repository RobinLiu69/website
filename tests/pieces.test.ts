import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Color, PieceType } from '../src/chess/types';
import { PieceFactory } from '../src/three/pieceMeshes';
import { type Ring, turnFacet } from '../src/three/pieces/toolkit';

const TYPES: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];
const COLORS: Color[] = ['w', 'b'];

const triangles = (g: THREE.BufferGeometry): Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> => {
  const position = g.getAttribute('position');
  const out: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
  for (let i = 0; i + 2 < position.count; i += 3) {
    out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, i + k)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
  }
  return out;
};

describe('turnFacet', () => {
  const cylinder: Ring[] = [
    [0, 0],
    [1, 0],
    [1, 2],
    [0, 2],
  ];

  it('faces every triangle of a closed solid outward', () => {
    const g = turnFacet(cylinder, 8);
    for (const [a, b, c] of triangles(g)) {
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      const centre = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
      // from the middle of the axis, a point on the surface lies in the direction its face looks
      const outward = centre.clone().sub(new THREE.Vector3(0, 1, 0));
      expect(normal.dot(outward)).toBeGreaterThan(0);
    }
  });

  it('breaks a band into triangles when the rings are turned half a facet apart', () => {
    const aligned = turnFacet(
      [
        [1, 0],
        [1, 1],
      ],
      8,
    );
    const twisted = turnFacet(
      [
        [1, 0],
        [1, 1, 1],
      ],
      8,
    );
    // one quad per facet is two triangles either way, but in the twisted band no two triangles are coplanar
    expect(aligned.getAttribute('position').count).toBe(8 * 2 * 3);
    expect(twisted.getAttribute('position').count).toBe(8 * 2 * 3);
    const normals = (g: THREE.BufferGeometry): string[] =>
      triangles(g).map(([a, b, c]) =>
        new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize().toArray().map((n) => n.toFixed(3)).join(','),
      );
    expect(new Set(normals(aligned)).size).toBe(8);
    expect(new Set(normals(twisted)).size).toBe(16);
  });

  it('raises every second corner of a ring, which is what makes the points of a crown', () => {
    const g = turnFacet(
      [
        [1, 0],
        [1, 1, 0, 0.5],
      ],
      6,
    );
    const heights = new Set(
      triangles(g).flatMap((t) => t.map((v) => v.y.toFixed(2))),
    );
    expect(heights).toEqual(new Set(['0.00', '1.00', '1.50']));
  });
});

describe('piece models', () => {
  const factory = new PieceFactory();
  const box = (type: PieceType, color: Color = 'w'): THREE.Box3 => {
    const geometry = factory.geometry(type, color);
    return geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
  };

  it.each(TYPES.flatMap((type) => COLORS.map((color) => [type, color] as const)))('builds a %s in colour %s', (type, color) => {
    const g = factory.geometry(type, color);
    const position = g.getAttribute('position');
    expect(position.count).toBeGreaterThan(30);
    expect(position.count % 3).toBe(0);
    expect(g.getAttribute('color').count).toBe(position.count);
    expect(g.getAttribute('normal').count).toBe(position.count);
    for (let i = 0; i < position.count; i++) {
      expect(Number.isFinite(position.getX(i)) && Number.isFinite(position.getY(i)) && Number.isFinite(position.getZ(i))).toBe(true);
    }
  });

  it('stands every piece on y = 0', () => {
    for (const type of TYPES) expect(box(type).min.y).toBeCloseTo(0, 3);
  });

  it('keeps the usual order of heights: pawn, rook, knight, bishop, queen, king', () => {
    const h = (type: PieceType): number => box(type).max.y;
    expect(h('p')).toBeLessThan(h('r'));
    expect(h('r')).toBeLessThan(h('b'));
    expect(h('n')).toBeLessThan(h('b'));
    expect(h('b')).toBeLessThan(h('q'));
    expect(h('q')).toBeLessThan(h('k'));
  });

  it('fits a square: the foot of every piece stays well inside one', () => {
    for (const type of TYPES) {
      const g = factory.geometry(type, 'w');
      const position = g.getAttribute('position');
      let foot = 0;
      for (let i = 0; i < position.count; i++) {
        if (position.getY(i) < 0.3) foot = Math.max(foot, Math.hypot(position.getX(i), position.getZ(i)));
      }
      expect(foot).toBeLessThan(0.46);
    }
  });

  it('gives both colours the same shape', () => {
    for (const type of TYPES) {
      const white = box(type, 'w');
      const black = box(type, 'b');
      expect(white.max.y).toBeCloseTo(black.max.y, 5);
      expect(white.max.x).toBeCloseTo(black.max.x, 5);
    }
  });
});
