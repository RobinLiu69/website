/**
 * The chalk pass. It reads the lit scene (only its brightness matters), a buffer of view-space normals and the
 * depth of the same frame, and draws them again as a chalk drawing on a dark sheet: outlines wherever depth or
 * surface direction jumps, hatching where the scene is bright, a little wobble everywhere so no line is machine
 * straight.
 *
 * Conventions for what the scene writes into the lit buffer:
 *  - brightness is how much chalk is wanted (black = bare sheet);
 *  - colour is the marker: anything with chroma is tinted with the accent colour.
 */

export const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const FRAGMENT = /* glsl */ `
// Every lookup is at level 0 of a texture without mipmaps, so it is safe inside branches.
#define SAMPLE(t, uv) textureLod(t, uv, 0.0)
uniform sampler2D tBeauty;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uUnit;     // one CSS pixel, in device pixels
uniform float uNear;
uniform float uFar;
uniform float uSeed;
uniform vec3 uPaper;     // the dark sheet
uniform vec3 uPaperLit;  // the sheet inside the lamp's pool of light
uniform vec3 uChalk;
uniform vec3 uAccent;
uniform vec4 uTone;      // brightness at which the 1st, 2nd, 3rd and 4th direction of hatching begin
uniform float uSolid;    // brightness at which the chalk stops hatching and fills in
uniform float uHatchGap; // CSS px between hatch lines
uniform float uLine;     // outline half width in CSS px
uniform float uCrease;   // how firmly the edges between facets are drawn (silhouettes are always firm)
uniform vec2 uCenter;    // where the lamp is, in NDC
uniform float uReveal;   // 0..1: how much of the drawing has been drawn in
uniform float uExposure; // 0..1: overall chalk strength, so the picture can recede while something else is read
uniform float uDebug;    // 1: show the brightness the scene was lit with, to tune it
varying vec2 vUv;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// A slow drift of the sample point: what makes a straight edge look drawn by hand.
vec2 wobble(vec2 p, float amount, float scale, float seed) {
  vec2 q = p / scale + seed;
  vec2 n = vec2(vnoise(q), vnoise(q + 31.7)) - 0.5;
  vec2 m = vec2(vnoise(q * 2.7 + 9.2), vnoise(q * 2.7 + 47.1)) - 0.5;
  return p + (n + 0.35 * m) * 2.0 * amount;
}

float linearDepth(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}

// x: a firm line where depth jumps (a silhouette); y: a lighter one where the surface turns (an edge between facets).
// Lines belong to the nearer surface.
vec2 edgeAt(vec2 coord, float radius) {
  vec2 px = 1.0 / uRes;
  vec2 uv = coord * px;
  float dC = SAMPLE(tDepth, uv).x;
  if (dC > 0.99999) return vec2(0.0);
  vec3 nC = SAMPLE(tNormal, uv).xyz * 2.0 - 1.0;
  float zC = linearDepth(dC);
  // Facet edges thin out with distance: on small, far objects they would only be noise.
  float farFade = 1.0 - 0.5 * smoothstep(22.0, 40.0, zC);
  vec2 e = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(radius, 0.0) : i == 1 ? vec2(-radius, 0.0) : i == 2 ? vec2(0.0, radius) : vec2(0.0, -radius);
    vec2 uv2 = uv + o * px;
    float d2 = SAMPLE(tDepth, uv2).x;
    vec3 n2 = SAMPLE(tNormal, uv2).xyz * 2.0 - 1.0;
    float z2 = d2 > 0.99999 ? uFar : linearDepth(d2);
    float behind = max(z2 - zC, 0.0) / zC;
    float front = max(zC - z2, 0.0) / zC;
    float silhouette = smoothstep(0.009, 0.024, behind);
    float crease = smoothstep(0.03, 0.17, 1.0 - dot(nC, n2)) * (1.0 - smoothstep(0.004, 0.012, front)) * farFade;
    e = max(e, vec2(silhouette, crease));
  }
  return e;
}

// Parallel strokes, broken into short runs. Where the picture is brighter, more of the strokes are there:
// each run has its own mind about how bright is bright enough, so the hatching thickens stroke by stroke
// instead of fading in. The strokes are a little off line and a little different in weight.
float strokes(vec2 p, float angle, float gap, float pen, float seed, float tone, float start) {
  float c = cos(angle);
  float s = sin(angle);
  float across = dot(p, vec2(-s, c)) / gap;
  float along = dot(p, vec2(c, s));
  float id = floor(across + 0.5);
  float dist = (across - id) * gap;
  // each stroke wanders and leans a little of its own accord
  dist += (vnoise(vec2(along * 0.018 / uUnit, id * 3.7 + seed)) - 0.5) * 1.1 * uUnit;
  dist += (hash21(vec2(id, seed + 3.0)) - 0.5) * 0.0035 * along;
  float runLength = 44.0 * uUnit;
  float run = floor(along / runLength + hash21(vec2(id, seed)) * 3.0);
  float chance = hash21(vec2(id * 1.37 + seed, run));
  // and now and then a run is simply not drawn
  float lapse = step(0.1, hash21(vec2(run * 1.91 + seed, id * 0.73)));
  float on = smoothstep(start + chance * 0.2, start + chance * 0.2 + 0.025, tone) * lapse;
  float width = pen * (0.65 + 0.7 * vnoise(vec2(along * 0.04 / uUnit, id * 1.7 + seed)));
  float line = 1.0 - smoothstep(width - 0.45 * uUnit, width + 0.45 * uUnit, abs(dist));
  return line * on;
}

void main() {
  float unit = uUnit;
  vec2 fc = vUv * uRes;
  vec4 beauty = SAMPLE(tBeauty, vUv);

  float lum = pow(clamp(dot(beauty.rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0), 0.4545);
  if (uDebug > 0.5) {
    gl_FragColor = vec4(vec3(lum), 1.0);
    return;
  }
  float tone = lum;

  // Hatching: each brighter band of the picture adds another direction of strokes.
  float gap = uHatchGap * unit;
  float pen = 0.5 * unit;
  float dense = 0.8 + 0.5 * smoothstep(0.4, 0.95, tone);
  // Bare sheet needs no strokes at all, and each direction only starts once the picture is bright enough for it.
  // Surfaces that face up (the board) are hatched along the floor, the rest (the pieces) steeply, so the two never merge.
  float up = smoothstep(0.5, 0.62, SAMPLE(tNormal, vUv).y * 2.0 - 1.0);
  float a1 = mix(1.12, 0.3, up);
  float a2 = mix(-0.5, 1.9, up);
  float hatch = 0.0;
  if (tone > uTone.x) {
    hatch = strokes(fc, a1, gap, pen * dense, 1.0, tone, uTone.x);
    if (tone > uTone.y) {
      hatch = max(hatch, strokes(fc, a2, gap, pen * dense, 2.0, tone, uTone.y));
      if (tone > uTone.z) {
        hatch = max(hatch, strokes(fc, 1.62, gap * 0.85, pen * dense, 3.0, tone, uTone.z));
        if (tone > uTone.w) hatch = max(hatch, strokes(fc, 0.3, gap * 0.62, pen * dense, 4.0, tone, uTone.w));
      }
    }
  }
  hatch = max(hatch, smoothstep(uSolid, uSolid + 0.03, tone));

  // Outlines: drawn twice, the second time lighter and a little off, the way a hand re-states a line.
  float r = max(uLine * unit, 0.5);
  vec2 first = edgeAt(wobble(fc, 1.3 * unit, 38.0 * unit, uSeed), r);
  vec2 second = edgeAt(wobble(fc + vec2(0.7, -0.9) * unit, 1.9 * unit, 53.0 * unit, uSeed + 11.0), r * 0.8);
  float pressure = 0.72 + 0.28 * vnoise(fc / (24.0 * unit) + 5.0);
  float lift = smoothstep(0.1, 0.22, vnoise(fc / (70.0 * unit) + 19.0 + uSeed));
  float firm = max(first.x * pressure * mix(1.0, lift, 0.6), second.x * 0.4);
  float facets = max(first.y * pressure, second.y * 0.4) * uCrease;
  float outline = max(firm, facets);

  float ink = clamp(max(hatch * 0.85, outline), 0.0, 1.0);

  // Chalk is grainy.
  ink *= 0.68 + 0.32 * hash21(floor(fc / max(unit, 1.0)) + uSeed * 3.1);

  // The lamp: the sheet is lightest, and the chalk strongest, where it shines.
  float aspect = uRes.x / uRes.y;
  vec2 centred = (vUv - (0.5 + 0.5 * uCenter)) * vec2(aspect, 1.0);
  float lamp = 1.0 - smoothstep(0.22, 1.0, length(centred * vec2(1.0, 1.12)));
  ink *= mix(0.3, 1.0, lamp);

  // Being drawn in, from the middle outward.
  float n = vnoise(fc / (52.0 * unit) + 3.0) * 0.4 + vnoise(fc / (15.0 * unit)) * 0.12;
  ink *= smoothstep(0.0, 0.1, uReveal * 1.5 - length(centred) - n);
  ink *= uExposure;

  vec3 paper = mix(uPaper, uPaperLit, lamp * lamp) * (0.94 + 0.12 * hash21(floor(fc / max(unit, 1.0))));

  // The marker: whatever the scene painted with colour is drawn in the accent, and washes the sheet a little.
  float chroma = max(max(beauty.r, beauty.g), beauty.b) - min(min(beauty.r, beauty.g), beauty.b);
  float marker = smoothstep(0.04, 0.5, chroma);

  vec3 colour = mix(paper, mix(uChalk, uAccent, marker), ink);
  colour = mix(colour, uAccent, marker * 0.38 * uExposure);

  gl_FragColor = vec4(colour, 1.0);
  // Leave the scene's depth behind, so lines drawn afterwards can pass behind the board and the pieces.
  gl_FragDepth = SAMPLE(tDepth, vUv).x;
}
`;
