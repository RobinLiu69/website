import {
  type Part,
  type Pt2,
  type Ring,
  ball,
  slab,
  surfaceFinder,
  surfaceStrip,
  turnFacet,
} from './toolkit';

/**
 * The foot every piece stands on, up to where the stem takes over: a chamfered disc, a ledge and a
 * short skirt. Its corners are aligned, so the faces are plain trapezoids.
 */
export const FOOT: readonly Ring[] = [
  [0, 0],
  [0.4, 0],
  [0.43, 0.05],
  [0.43, 0.16],
  [0.36, 0.23],
  [0.3, 0.23],
  [0.265, 0.34],
];

/** Stem rings from (radius, height) pairs. Each is turned half a facet from the last, so the faces become triangles. */
const stem = (...points: Array<readonly [number, number]>): Ring[] =>
  points.map(([r, y], i): Ring => [r, y, i % 2 === 0 ? 1 : 0]);

/** A flange: a flat-edged collar that sits on top of a stem and holds up the head. */
const flange = (r: number, y: number, h: number): Ring[] => [
  [r, y, 0],
  [r, y + h, 0],
  [r * 0.62, y + h * 1.9, 0],
  [0, y + h * 1.9, 0],
];

export function pawn(): Part[] {
  const body: Ring[] = [
    ...FOOT,
    ...stem([0.2, 0.47], [0.165, 0.6], [0.15, 0.7]),
    [0.285, 0.75, 0],
    ...flange(0.285, 0.75, 0.06).slice(1),
  ];
  // the head is a cut gem
  const head: Ring[] = [
    [0, 0.8],
    [0.16, 0.83, 0],
    [0.235, 0.97, 1],
    [0.235, 1.09, 0],
    [0.15, 1.2, 1],
    [0, 1.29, 0],
  ];
  return [{ geometry: turnFacet(body) }, { geometry: turnFacet(head) }];
}

export function rook(): Part[] {
  const rings: Ring[] = [
    ...FOOT,
    ...stem([0.225, 0.5], [0.205, 0.68], [0.225, 0.8]),
    [0.315, 0.9, 0],
    [0.35, 0.98, 1],
    [0.35, 1.05, 0],
    // the crown: five points, a wall outside and another in, and a floor between
    [0.35, 1.12, 0, 0.25],
    [0.27, 1.12, 0, 0.25],
    [0.27, 1.05, 0],
    [0, 1.05, 0],
  ];
  return [{ geometry: turnFacet(rings) }];
}

export function bishop(): Part[] {
  const body: Ring[] = [
    ...FOOT,
    ...stem([0.2, 0.48], [0.155, 0.7], [0.135, 0.88]),
    [0.275, 0.94, 0],
    ...flange(0.275, 0.94, 0.06).slice(1),
  ];

  // The mitre: a tall cut egg with a ball on top.
  const mitre: Ring[] = [
    [0, 1.0, 0],
    [0.17, 1.03, 0],
    [0.265, 1.16, 1],
    [0.28, 1.32, 0],
    [0.225, 1.5, 1],
    [0.125, 1.65, 0],
    [0.045, 1.76, 1],
    [0, 1.8, 0],
  ];
  const mitreGeometry = turnFacet(mitre);

  return [
    { geometry: turnFacet(body) },
    { geometry: mitreGeometry.clone() },
    { geometry: ball(0.065, 0, 1.84) },
    // The slit across the mitre, laid on the surface so it reads as cut into it from either side.
    {
      geometry: surfaceStrip(surfaceFinder(mitreGeometry), { cx: 0, cy: 1.36, length: 0.5, width: 0.06, angle: 0.62 }),
      tone: 'dark',
    },
  ];
}

export function queen(): Part[] {
  const body: Ring[] = [
    ...FOOT,
    ...stem([0.205, 0.5], [0.16, 0.74], [0.14, 0.96]),
    [0.285, 1.02, 0],
    ...flange(0.285, 1.02, 0.06).slice(1),
  ];

  // The crown has eight points: sixteen corners, every second one raised.
  const crown: Ring[] = [
    [0, 1.1, 0],
    [0.17, 1.13, 0],
    [0.245, 1.3, 1],
    [0.33, 1.5, 0],
    [0.345, 1.56, 1],
    [0.345, 1.62, 0, 0.27],
    [0.275, 1.62, 0, 0.27],
    [0.275, 1.56, 0],
    [0, 1.56, 0],
  ];
  const finial: Ring[] = [
    [0, 1.5, 0],
    [0.085, 1.54, 0],
    [0.06, 1.68, 1],
    [0.1, 1.74, 0],
    [0.1, 1.8, 0],
    [0.05, 1.86, 1],
    [0, 1.9, 0],
  ];
  return [
    { geometry: turnFacet(body) },
    { geometry: turnFacet(crown, 16) },
    { geometry: turnFacet(finial) },
    { geometry: ball(0.04, 0, 1.94) },
  ];
}

/** A plain cross, arms and stem the same thickness. */
const CROSS: readonly Pt2[] = (() => {
  const w = 0.06; // half thickness
  const arm = 0.165; // half span of the arms
  const rise = 0.17; // where the arms start
  const top = 0.4;
  return [
    [-w, 0],
    [w, 0],
    [w, rise],
    [arm, rise],
    [arm, rise + 2 * w],
    [w, rise + 2 * w],
    [w, top],
    [-w, top],
    [-w, rise + 2 * w],
    [-arm, rise + 2 * w],
    [-arm, rise],
    [-w, rise],
  ] as const;
})();

export function king(): Part[] {
  const body: Ring[] = [
    ...FOOT,
    ...stem([0.21, 0.54], [0.165, 0.82], [0.145, 1.02]),
    [0.295, 1.08, 0],
    ...flange(0.295, 1.08, 0.06).slice(1),
  ];

  // A wide faceted bowl under a sloping lid.
  const bowl: Ring[] = [
    [0, 1.12, 0],
    [0.18, 1.15, 0],
    [0.25, 1.3, 1],
    [0.34, 1.5, 0],
    [0.36, 1.58, 1],
    [0.36, 1.64, 0],
    [0.27, 1.74, 1],
    [0.14, 1.82, 0],
    [0.05, 1.86, 1],
    [0, 1.87, 0],
  ];

  const cross = slab(CROSS, 0.08, 0.025);
  cross.translate(0, 1.84, 0);
  return [{ geometry: turnFacet(body) }, { geometry: turnFacet(bowl) }, { geometry: cross }];
}

/** The knight's own pedestal: the same foot with a short column and collar for the neck to rise from. */
export const pedestal = (): Part => ({
  geometry: turnFacet([
    ...FOOT,
    [0.22, 0.42, 1],
    [0.31, 0.46, 0],
    [0.31, 0.52, 0],
    [0.23, 0.58, 0],
    [0, 0.58, 0],
  ]),
});

