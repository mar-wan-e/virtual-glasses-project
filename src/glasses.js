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
 * One Euro filter settings for the head pose (see smoothing.js).
 * minCutoff (Hz): lower = steadier when still. beta: higher = less lag when
 * moving (kept at the slider maximum: no visible lag was the priority).
 * dCutoff (Hz): how quickly a movement is noticed.
 * Only rotation and distance are smoothed this way; the position is locked
 * to the (lightly filtered) eye centre every frame, so it never trails.
 */
export const SMOOTHING = { minCutoff: 1.5, beta: 1, dCutoff: 4 };

/**
 * Invisible head occluder (see renderer3d.js). Its width follows each user's
 * measured face width automatically (facefit.js); these values are relative
 * to that, so they suit every face:
 *   z (cm): push it back from the face surface. Negative = further back, so
 *     it doesn't clip the frame where it rests on the nose; too far back and
 *     the far temple arm shows again.
 *   width: x scale of the user's head. 1 = their real width, so the head
 *     hides the arms wherever a real head would; the arms are routed around
 *     the outside of the temples (renderer3d.js aimArms) so they still show.
 *   ear (cm, on an average-width face): centre of the left ear (the right ear
 *     mirrors it). Ears stick out from the head, so the ear sits outside the
 *     temple arm; the arm rests on its top and curves down behind it, hidden.
 *     Canonical face edge at ear level is x ≈ 7.7, y ≈ 0.7, z ≈ -2.4
 *     (landmark 454); the ear is just behind and outside that.
 */
export const OCCLUDER = { z: -0.3, width: 1.0, ear: { x: 8.2, y: 1.0, z: -4.0 } };

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
 *
 * These describe the model, not the wearer: tune them once per design. Each
 * user's face width and eye position are measured live (facefit.js and
 * pinToEyes in renderer3d.js), so the same values fit every face.
 * @property {number} scale3d   - frame width as a fraction of the wearer's
 *   face width at the temples (landmarks 127-356; 15.5 cm on the average
 *   face). 0.9 = a 14 cm frame on an average face.
 * @property {{x:number,y:number,z:number}} offset3d - where the centre of the
 *   lenses' front surface sits, relative to the face (x/y are measured from
 *   the eyes by pinning, so mainly z and a small y lift matter).
 * @property {{x:number,y:number,z:number}} rotation3d - extra rotation in
 *   degrees. x tilts the frame front about the lens centre (the forward tilt
 *   real lenses have); the arms are re-aimed at the ears afterwards.
 * @property {number} armLength - the arms are bent automatically to reach the
 *   wearer's ears (renderer3d.js aimArms); this fine-tunes how far past the
 *   ear they go. 1 = default.
 * @property {number} [hookTuck] - how far (cm) the arm's end tucks in toward
 *   the head behind the ear (default 1.2, renderer3d.js HOOK_TUCK).
 *
 * Lenses:
 * @property {string} lensColor   - tint, CSS colour
 * @property {number} lensOpacity - 0..1; low enough that the eyes show through
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
    scale3d: 0.9,
    offset3d: { x: 0, y: 2.7, z: 6.0 },
    rotation3d: { x: 0, y: 0, z: 0 },
    armLength: 1,
    hookTuck: 0.5, // short hook: a small tuck keeps the tip behind the ear
    lensColor: '#d6e4ee', // clear optical lens, faint blue coating
    lensOpacity: 0.2,
  },
  {
    id: 'blue',
    name: 'Blue Sun',
    model: `${BASE}models/glasses-2.glb`,
    image: `${BASE}models/glasses-2.png`,
    scale2d: 1.5,
    bridgeY2d: 0.4,
    scale3d: 0.9,
    offset3d: { x: 0, y: 2.7, z: 6.0 },
    rotation3d: { x: 0, y: 0, z: 0 },
    armLength: 1,
    lensColor: '#1c3a78', // blue sunglass tint
    lensOpacity: 0.45,
  },
  {
    id: 'angular',
    name: 'Angular Black',
    model: `${BASE}models/glasses-3.glb`,
    image: `${BASE}models/glasses-3.png`,
    scale2d: 1.5,
    bridgeY2d: 0.4,
    scale3d: 0.9,
    offset3d: { x: 0, y: 2.7, z: 6.0 },
    rotation3d: { x: 0, y: 0, z: 0 },
    armLength: 1,
    lensColor: '#2a2a2a', // grey sunglass tint
    lensOpacity: 0.5,
  },
];
