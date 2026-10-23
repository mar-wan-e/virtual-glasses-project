// glasses.js — catalogue of glasses designs.
// Each entry holds the asset paths plus per-model tuning values (offset,
// rotation, scale) found by eye with the debug sliders in Phase 3/4.

/**
 * @typedef {object} GlassesDesign
 * @property {string} id
 * @property {string} name     - label shown in the picker
 * @property {string} model    - path to the .glb file (3D mode)
 * @property {string} image    - path to the transparent .png (2D mode)
 * @property {{x:number,y:number,z:number}} offset
 * @property {{x:number,y:number,z:number}} rotation - radians
 * @property {number} scale
 * @property {number} scale2d  - PNG width as a multiple of eye-corner distance
 * @property {number} offsetY2d - vertical PNG shift as a fraction of its height
 */

/** @type {GlassesDesign[]} */
export const GLASSES = [
  // TODO (Phase 2–4): add 3 designs once assets are downloaded into public/models.
];
