// glasses.js — catalogue of glasses designs.
// Each entry holds the asset paths plus per-model tuning values found by eye
// (2D values with the tuning keys in Phase 2, 3D values with sliders in Phase 3).

const BASE = import.meta.env.BASE_URL; // "/" in dev, "/<repo>/" on GitHub Pages

/**
 * @typedef {object} GlassesDesign
 * @property {string} id
 * @property {string} name      - label shown in the picker
 * @property {string} model     - path to the .glb file (3D mode)
 * @property {string} image     - path to the transparent .png (2D mode)
 * @property {number} scale2d   - PNG width as a multiple of the distance
 *   between the outer eye corners (landmarks 33 and 263). Glasses are wider
 *   than the eyes, so this is > 1.
 * @property {number} bridgeY2d - where the nose-bridge landmark (168) sits on
 *   the PNG, as a fraction of its height from the top (0 = top edge).
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
  },
  {
    id: 'blue',
    name: 'Blue Sun',
    model: `${BASE}models/glasses-2.glb`,
    image: `${BASE}models/glasses-2.png`,
    scale2d: 1.5,
    bridgeY2d: 0.4,
  },
  {
    id: 'angular',
    name: 'Angular Black',
    model: `${BASE}models/glasses-3.glb`,
    image: `${BASE}models/glasses-3.png`,
    scale2d: 1.5,
    bridgeY2d: 0.4,
  },
];
