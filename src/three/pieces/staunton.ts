import {
  type Part,
  type Pt2,
  type Ring,
  ball,
  curve,
  flange,
  lattice,
  merlons,
  slab,
  surfaceFinder,
  surfaceStrip,
  turnFacet,
} from './toolkit';

/**
 * Real Staunton proportions, in board squares (the board's squares are 1 wide). A tournament king is about 1.7
 * squares tall with a base two fifths of that; the others follow in the usual order:
 *
 *            height   base (diameter)
 *   king      1.78     0.72
 *   queen     1.58     0.68
 *   bishop    1.42     0.66
 *   knight    1.32     0.66
 *   rook      1.12     0.66
 *   pawn      0.96     0.58
 */

/**
 * The foot every piece stands on: two chamfered discs, one stepped in from the other, and the top of the second
 * where the skirt takes over. Ends at y 0.19.
 */
const foot = (radius: number): Ring[] => [
  [0, 0],
  [radius - 0.035, 0],
  [radius, 0.035],
  [radius, 0.08],
  [radius - 0.04, 0.115],
  [radius - 0.065, 0.115],
  [radius - 0.065, 0.15],
  [radius - 0.09, 0.185],
];

/** The skirt sweeping out of the foot and the stem above it, as one smooth stretch with a lattice of facets. */
const stem = (...control: Array<readonly [number, number]>): Ring[] => lattice(curve(control, control.length * 2));

/** The ruff under a head: two flanges with a groove between them. */
const collar = (y: number, neck: number, outer: number): Ring[] => [
  [neck, y],
  ...flange(outer, y + 0.02, 0.045),
  [neck + 0.03, y + 0.09],
  [neck + 0.03, y + 0.11],
  ...flange(outer + 0.03, y + 0.12, 0.055, 0.025),
];

export function pawn(): Part[] {
  const body: Ring[] = [
    ...foot(0.29),
    ...stem([0.205, 0.22], [0.15, 0.34], [0.115, 0.46], [0.09, 0.56]),
    [0.09, 0.56],
    ...flange(0.175, 0.58, 0.05),
    [0.1, 0.65],
  ];
  // The head is a cut gem.
  const head: Ring[] = [
    [0, 0.64],
    [0.1, 0.65, 1],
    [0.155, 0.7, 0],
    [0.175, 0.775, 1],
    [0.155, 0.85, 0],
    [0.095, 0.915, 1],
    [0, 0.96, 0],
  ];
  return [{ geometry: turnFacet(body) }, { geometry: turnFacet(head) }];
}

export function rook(): Part[] {
  const rings: Ring[] = [
    ...foot(0.33),
    ...stem([0.235, 0.22], [0.2, 0.34], [0.175, 0.48], [0.17, 0.62]),
    // the tower flares out into its parapet
    ...flange(0.2, 0.64, 0.045),
    [0.215, 0.74, 1],
    [0.255, 0.8, 0],
    [0.295, 0.85, 1],
    [0.305, 0.875],
    [0.305, 0.92],
    [0.285, 0.945],
    [0.285, 0.965],
    // the floor between the battlements, sunk a little
    [0.2, 0.965],
    [0.2, 0.94],
    [0, 0.94],
  ];
  return [
    { geometry: turnFacet(rings) },
    ...merlons(0.285, 0.085, 0.955, 0.16).map((geometry) => ({ geometry })),
  ];
}

export function bishop(): Part[] {
  const body: Ring[] = [
    ...foot(0.33),
    ...stem([0.235, 0.22], [0.19, 0.38], [0.15, 0.56], [0.115, 0.72]),
    ...collar(0.72, 0.115, 0.17),
  ];

  // The mitre: a tall cut egg with a ball on top.
  const mitre: Ring[] = [
    [0, 0.895],
    [0.15, 0.91, 1],
    [0.205, 0.99, 0],
    [0.225, 1.08, 1],
    [0.2, 1.18, 0],
    [0.135, 1.27, 1],
    [0.06, 1.33, 0],
    [0, 1.36, 1],
  ];
  const mitreGeometry = turnFacet(mitre);

  return [
    { geometry: turnFacet(body) },
    { geometry: mitreGeometry.clone() },
    { geometry: ball(0.055, 0, 1.385) },
    // The slit across the mitre, laid on the surface so it reads as cut into it from either side.
    {
      geometry: surfaceStrip(surfaceFinder(mitreGeometry), { cx: 0, cy: 1.1, length: 0.4, width: 0.055, angle: 0.62 }),
      tone: 'dark',
    },
  ];
}

export function queen(): Part[] {
  const body: Ring[] = [
    ...foot(0.34),
    ...stem([0.24, 0.22], [0.195, 0.4], [0.15, 0.6], [0.12, 0.78]),
    ...collar(0.78, 0.12, 0.18),
  ];

  // The crown has eight points: sixteen corners, every second one raised.
  const crown: Ring[] = [
    [0, 0.955],
    [0.15, 0.97, 1],
    [0.21, 1.06, 0],
    [0.265, 1.16, 1],
    [0.3, 1.24, 0],
    [0.3, 1.27, 0, 0.14],
    [0.235, 1.27, 0, 0.14],
    [0.235, 1.23, 0],
    [0, 1.23, 0],
  ];
  const finial: Ring[] = [
    [0, 1.2],
    [0.07, 1.24, 1],
    [0.06, 1.34, 0],
    [0.085, 1.4, 1],
    [0.085, 1.46, 0],
    [0.045, 1.52, 1],
    [0, 1.55, 0],
  ];
  return [
    { geometry: turnFacet(body) },
    { geometry: turnFacet(crown, 16) },
    { geometry: turnFacet(finial) },
  ];
}

/** A plain cross, arms and stem the same thickness. */
const CROSS: readonly Pt2[] = (() => {
  const w = 0.055; // half thickness
  const arm = 0.15; // half span of the arms
  const rise = 0.14; // where the arms start
  const top = 0.3;
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
    ...foot(0.36),
    ...stem([0.255, 0.22], [0.21, 0.42], [0.16, 0.66], [0.125, 0.88]),
    ...collar(0.88, 0.125, 0.19),
  ];

  // A wide faceted bowl under a sloping lid.
  const bowl: Ring[] = [
    [0, 1.055],
    [0.16, 1.07, 1],
    [0.225, 1.17, 0],
    [0.28, 1.28, 1],
    [0.318, 1.37, 0],
    [0.33, 1.41, 1],
    [0.33, 1.45, 0],
    [0.28, 1.49, 1],
    [0.18, 1.53, 0],
    [0.08, 1.555, 1],
    [0, 1.56, 0],
  ];

  const cross = slab(CROSS, 0.08, 0.025);
  cross.translate(0, 1.46, 0);
  return [{ geometry: turnFacet(body) }, { geometry: turnFacet(bowl) }, { geometry: cross }];
}

/** The knight's own pedestal: the same foot with a short column and collar for the neck to rise from. */
export const pedestal = (): Part => ({
  geometry: turnFacet([
    ...foot(0.33),
    ...stem([0.235, 0.22], [0.2, 0.34], [0.185, 0.44]),
    ...flange(0.25, 0.46, 0.05),
    [0.2, 0.55],
    [0, 0.55],
  ]),
});
