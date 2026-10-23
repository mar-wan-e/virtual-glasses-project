// glasses.js — catalogue of glasses designs.
// Each entry holds the asset paths plus per-model tuning values found by eye
// (2D values with the tuning keys in Phase 2, 3D values with sliders in Phase 3).

const BASE = import.meta.env.BASE_URL; // "/" in dev, "/<repo>/" on GitHub Pages

/**
 * Vertical field of view (degrees) of the virtual 3D camera. MediaPipe's face
 * geometry assumes a 63° camera when it builds the transformation matrix, so
 * that's the starting point; real webcams differ, hence the debug slider.
 */
export const CAMERA_FOV = 63;

/**
 * @typedef {object} GlassesDesign
 * @property {string} id
 * @property {string} name      - label shown in the picker
 * @property {string} model     - path to the .glb file (3D mode)
 * @property {string} image     - path to the transparent .png (2D mode)
 *
 * 2D fit:
 * @property {number} scale2d   - PNG width as a multiple of the distance
 *   between the outer eye corners (landmarks 33 and 263). Glasses are wider
 *   than the eyes, so this is > 1.
 * @property {number} bridgeY2d - where the nose-bridge landmark (168) sits on
 *   the PNG, as a fraction of its height from the top (0 = top edge).
 *
 * 3D fit, in MediaPipe's canonical face space (centimetres; origin inside the
 * head, +y up, +z out of the face; eye level is y ≈ 2.6, eye surface z ≈ 3.8):
 * @property {number} scale3d   - frame width as a multiple of the outer
 *   eye-corner distance (8.9 cm on the canonical face), like scale2d.
 * @property {{x:number,y:number,z:number}} offset3d - where the centre of the
 *   lenses' front surface sits on the face.
 * @property {{x:number,y:number,z:number}} rotation3d - extra rotation in
 *   degrees, e.g. x for the forward tilt of the lenses.
 */

/** @type {GlassesDesign[]} */
export const GLASSES = [
  {
    id: 'classic',
    name: 'Classic Black',
    model: `${BASE}models/glasses-1.glb`,
    image: `${BASE}models/glasses-1.png`,
    scale2d: 1.5,
    bridgeY2d: 0.4,
    scale3d: 1.5,
    offset3d: { x: 0, y: 2.7, z: 6.0 },
    rotation3d: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'blue',
    name: 'Blue Sun',
    model: `${BASE}models/glasses-2.glb`,
    image: `${BASE}models/glasses-2.png`,
    scale2d: 1.5,
    bridgeY2d: 0.4,
    scale3d: 1.5,
    offset3d: { x: 0, y: 2.7, z: 6.0 },
    rotation3d: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'angular',
    name: 'Angular Black',
    model: `${BASE}models/glasses-3.glb`,
    image: `${BASE}models/glasses-3.png`,
    scale2d: 1.5,
    bridgeY2d: 0.4,
    scale3d: 1.5,
    offset3d: { x: 0, y: 2.7, z: 6.0 },
    rotation3d: { x: 0, y: 0, z: 0 },
  },
];
