import * as THREE from 'three';
import type { Color, PieceType } from './chess/types';
import { PALETTE } from './theme';
import { addLighting } from './three/lighting';
import { PieceFactory } from './three/pieceMeshes';
import { SketchPipeline } from './three/sketch/pipeline';

/**
 * A bench for looking at the piece models up close: both colours in a row under the same
 * light and the same pen as the site, with a camera that can be moved from outside (see window.__lab).
 * Query: ?gap=1.5 spacing, ?scale=0.92 piece scale.
 */
const params = new URLSearchParams(location.search);
const gap = Number(params.get('gap') ?? 1.5);
const scale = Number(params.get('scale') ?? 0.92);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(PALETTE.bg);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
addLighting(scene);
const sketch = new SketchPipeline(renderer);
sketch.setSize(window.innerWidth, window.innerHeight, pixelRatio);

const factory = new PieceFactory();
const order: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];
const rows: Record<Color, THREE.Group> = { w: new THREE.Group(), b: new THREE.Group() };
const pieces: Record<Color, Partial<Record<PieceType, THREE.Mesh>>> = { w: {}, b: {} };

// Squares to stand on, so contrast against the board can be judged.
const tileGeo = new THREE.BoxGeometry(gap, 0.2, gap);
const tileLight = new THREE.MeshLambertMaterial({ color: PALETTE.boardLight });
const tileDark = new THREE.MeshLambertMaterial({ color: PALETTE.boardDark });

for (const color of ['w', 'b'] as const) {
  const group = rows[color];
  group.position.z = color === 'w' ? gap * 0.6 : -gap * 0.6;
  order.forEach((type, i) => {
    const x = (i - (order.length - 1) / 2) * gap;
    const tile = new THREE.Mesh(tileGeo, (i + (color === 'w' ? 0 : 1)) % 2 === 0 ? tileDark : tileLight);
    tile.position.set(x, -0.1, 0);
    tile.receiveShadow = true;
    group.add(tile);

    const piece = factory.create(type, color);
    pieces[color][type] = piece;
    piece.scale.setScalar(scale);
    piece.position.x = x;
    if (type === 'n') piece.rotation.y = Number(params.get('kyaw') ?? 0);
    group.add(piece);
  });
  scene.add(group);
}

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 220);

function setCamera(pos: [number, number, number], look: [number, number, number], fov = 30): void {
  camera.fov = fov;
  camera.position.set(...pos);
  camera.lookAt(...look);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  sketch.render(scene, camera);
}

function show(which: 'w' | 'b' | 'both'): void {
  rows.w.visible = which !== 'b';
  rows.b.visible = which !== 'w';
}

/** Show a single piece type (or all of them with null), so side views are not blocked by neighbours. */
function solo(type: PieceType | null): void {
  for (const color of ['w', 'b'] as const) {
    for (const [t, mesh] of Object.entries(pieces[color])) if (mesh) mesh.visible = type === null || t === type;
  }
}

/** Re-renders after changing the look (paper, tone thresholds, hatch spacing, ...). */
function look(partial: Parameters<SketchPipeline['setLook']>[0]): void {
  sketch.setLook(partial);
  sketch.render(scene, camera);
}

setCamera([0, 2.4, 13], [0, 0.8, 0]);

Object.assign(window, { __lab: { setCamera, show, solo, look, scene, camera, renderer, factory, rows, gap, sketch } });
