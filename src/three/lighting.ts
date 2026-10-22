import * as THREE from 'three';

export interface LightingOptions {
  /** Shadow map edge in pixels. */
  shadowSize?: number;
}

export interface Lighting {
  sun: THREE.DirectionalLight;
}

/**
 * The lights shared by the site and the piece lab. They are plain white on purpose: the sketch pass reads
 * the lit picture as brightness only (any colour in it is taken to be marker), so the light is what decides
 * where the chalk goes: the lit side of everything is drawn, and cast shadows are left as bare sheet.
 */
export function addLighting(scene: THREE.Scene, options: LightingOptions = {}): Lighting {
  const { shadowSize = 2048 } = options;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a6a, 0.45));

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-7, 11, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const cam = sun.shadow.camera;
  cam.left = -12;
  cam.right = 12;
  cam.top = 12;
  cam.bottom = -12;
  cam.near = 2;
  cam.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.5;
  scene.add(sun);

  // A weak light from the viewer's side, so faces turned away from the sun are shaded rather than black.
  const fill = new THREE.DirectionalLight(0xffffff, 0.22);
  fill.position.set(5, 6, 14);
  scene.add(fill);

  return { sun };
}
