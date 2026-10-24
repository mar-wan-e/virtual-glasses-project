// facefit.js — measures each user's face so the glasses fit anyone, with no
// manual tuning.
//
// MediaPipe's pose matrix assumes everyone has its average "canonical" face.
// Real faces differ, so we measure two things and correct for them:
//   - Width: the user's temple-to-temple width (landmarks 127 and 356) vs.
//     where the canonical temples land on screen under the same pose. The
//     ratio scales the glasses, the invisible head and the ears.
//   - Ear height: where the face meets the ears (landmarks 234 and 454) vs.
//     the canonical face, in cm. This moves the invisible ears, and so where
//     the temple arms hook over them.
//
// Comparing on screen under the *same* pose makes the measurements
// independent of distance and head turn. Still, the far side of the face is
// hidden when the head is turned, so we only measure while the face is
// roughly frontal, and average over many frames so one bad frame can't
// change the fit.

// Measured on four test faces at webcam distance (~40 cm): width ratios 1.02,
// 1.05, 1.08 (a child, widest), and one turned face that is correctly not
// measured. Note: close-up photos (face filling the frame) read ~12% wider for
// every face, because MediaPipe then assumes the head is ~20 cm away and the
// perspective is exaggerated; test at realistic distance.

// Only measure when the face points within this angle of the camera.
const MAX_ANGLE_DEG = 15;
// Weight of each new measurement in the running average (~1-2 s to settle).
const AVERAGE_WEIGHT = 0.05;
// A face doesn't change shape, so after this many good measurements (~1.5 s
// at 30 FPS) the values are locked until the face is lost. Re-fitting every
// frame would re-bend the arms constantly for no visible benefit.
const LOCK_AFTER_SAMPLES = 45;
// Measurements outside these ranges are treated as bad.
const RATIO_RANGE = [0.8, 1.25];
const EAR_OFFSET_RANGE = [-2.5, 2.5]; // cm
// After this long without a face, assume it may be a different person.
const FORGET_AFTER_MS = 2000;

/**
 * @typedef {object} FaceFit
 * @property {number} ratio - face width / canonical face width (1 = average)
 * @property {number} earOffsetY - ears higher (+) or lower (-) than average, cm
 */

/**
 * Creates a face-shape estimator.
 * @returns {{
 *   update: (m: { measuredWidth: number, expectedWidth: number, earOffsetY: number, facingAngleDeg: number }, timeMs: number) => FaceFit,
 *   value: () => FaceFit,
 *   reset: () => void,
 * }}
 */
export function createFaceFit() {
  let fit = { ratio: 1, earOffsetY: 0 };
  let samples = 0; // good measurements so far (0 = none yet)
  let lastSeen = -Infinity;

  /**
   * Feeds one frame's measurement in and returns the current estimate.
   * @param {{ measuredWidth: number, expectedWidth: number, earOffsetY: number, facingAngleDeg: number }} m
   *   from renderer3d.js measureFace()
   * @param {number} timeMs - frame time
   * @returns {FaceFit}
   */
  function update(m, timeMs) {
    if (timeMs - lastSeen > FORGET_AFTER_MS) reset();
    lastSeen = timeMs;

    if (samples >= LOCK_AFTER_SAMPLES) return fit; // locked for this face
    if (m.facingAngleDeg > MAX_ANGLE_DEG || m.expectedWidth <= 0) return fit;
    const ratio = m.measuredWidth / m.expectedWidth;
    if (ratio < RATIO_RANGE[0] || ratio > RATIO_RANGE[1]) return fit;
    if (m.earOffsetY < EAR_OFFSET_RANGE[0] || m.earOffsetY > EAR_OFFSET_RANGE[1]) return fit;

    if (samples === 0) {
      fit = { ratio, earOffsetY: m.earOffsetY }; // first good frame: start from it
    } else {
      fit = {
        ratio: fit.ratio + (ratio - fit.ratio) * AVERAGE_WEIGHT,
        earOffsetY: fit.earOffsetY + (m.earOffsetY - fit.earOffsetY) * AVERAGE_WEIGHT,
      };
    }
    samples++;
    return fit;
  }

  function reset() {
    fit = { ratio: 1, earOffsetY: 0 };
    samples = 0;
  }

  return { update, value: () => fit, reset };
}
