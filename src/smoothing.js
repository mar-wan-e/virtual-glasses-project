// smoothing.js — One Euro filter for jitter-free, low-lag head pose.
//
// A plain low-pass filter has one trade-off: smooth (but laggy) or responsive
// (but jittery). The One Euro filter (Casiez et al., CHI 2012) changes its
// cutoff frequency with speed:
//   cutoff = minCutoff + beta * |speed|
// Head still   -> low cutoff  -> heavy smoothing, no jitter.
// Head moving  -> high cutoff -> light smoothing, no lag.
//   minCutoff (Hz): lower = less jitter when still (but more lag)
//   beta:           higher = less lag when moving fast (but more jitter)
//   dCutoff (Hz):   how fast the speed estimate reacts. Low values make the
//                   filter notice a movement late, so the glasses trail at the
//                   start of every head turn; we use 4 Hz instead of the
//                   paper's default of 1 Hz.

import * as THREE from 'three';

// Position is in cm and moves at tens of cm/s; quaternion components move at
// about 1 unit/s at most. The same beta would barely react to rotation speed,
// so rotation uses beta scaled by this factor.
const ROTATION_BETA_SCALE = 20;

// If no face was seen for this long, start fresh instead of smoothing from a
// stale pose (which would make the glasses slide in from the old position).
const RESET_AFTER_MS = 300;

/**
 * Smoothing factor for an exponential low-pass filter with the given cutoff
 * frequency, sampled every `dt` seconds.
 * @param {number} cutoff - Hz
 * @param {number} dt - seconds
 * @returns {number} alpha in 0..1 (1 = no smoothing)
 */
function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * One Euro filter for a single number.
 */
class OneEuroFilter {
  /**
   * @param {{ minCutoff: number, beta: number, dCutoff?: number }} params
   *   dCutoff: cutoff for smoothing the speed estimate itself (Hz)
   */
  constructor(params) {
    this.params = params;
    this.x = null; // last filtered value
    this.dx = 0; // last filtered speed
  }

  /**
   * @param {number} value - new raw sample
   * @param {number} dt - seconds since the previous sample
   * @param {number} betaScale - multiplies beta (see ROTATION_BETA_SCALE)
   * @returns {number} filtered value
   */
  filter(value, dt, betaScale = 1) {
    if (this.x === null || dt <= 0) {
      this.x = value;
      return value;
    }
    const { minCutoff, beta, dCutoff = 1 } = this.params;
    // 1. Estimate speed and smooth it, so one noisy frame can't spike it.
    const rawSpeed = (value - this.x) / dt;
    this.dx += alpha(dCutoff, dt) * (rawSpeed - this.dx);
    // 2. Faster movement -> higher cutoff -> less smoothing.
    const cutoff = minCutoff + beta * betaScale * Math.abs(this.dx);
    // 3. Low-pass the value with that cutoff.
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}

/**
 * Creates a One Euro filter for a 2D point in normalised image coordinates
 * (0..1), used for the eye centre the glasses are pinned to. Units differ
 * from the pose (a fast head move is ~1 image-width per second, not tens of
 * cm/s), so this has its own fixed settings: steady when still, and at
 * normal head speeds the cutoff is so high that it adds almost no lag.
 * @returns {{ filter: (p: {x: number, y: number}, timeMs: number) => {x: number, y: number}, reset: () => void }}
 */
export function createPointFilter() {
  const params = { minCutoff: 3, beta: 40, dCutoff: 4 };
  const fx = new OneEuroFilter(params);
  const fy = new OneEuroFilter(params);
  let lastTime = -Infinity;

  function reset() {
    fx.reset();
    fy.reset();
    lastTime = -Infinity;
  }

  function filter(p, timeMs) {
    if (timeMs - lastTime > RESET_AFTER_MS) reset();
    const dt = (timeMs - lastTime) / 1000;
    lastTime = timeMs;
    return { x: fx.filter(p.x, dt), y: fy.filter(p.y, dt) };
  }

  return { filter, reset };
}

/**
 * Creates a filter for a full head pose given as a 4x4 matrix: 3 filters for
 * position and 4 for the rotation quaternion. Scale passes through.
 * @param {{ minCutoff: number, beta: number }} params - shared, live object;
 *   changing its fields (e.g. from the debug sliders) takes effect next frame
 * @returns {{ filter: (matrix: number[], timeMs: number) => number[], reset: () => void }}
 */
export function createPoseFilter(params) {
  const posFilters = [0, 1, 2].map(() => new OneEuroFilter(params));
  const rotFilters = [0, 1, 2, 3].map(() => new OneEuroFilter(params));
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const prevQuat = new THREE.Quaternion();
  let lastTime = -Infinity;

  function reset() {
    for (const f of [...posFilters, ...rotFilters]) f.reset();
    lastTime = -Infinity;
  }

  /**
   * @param {number[]} matrix - 16 numbers, column-major
   * @param {number} timeMs - frame time
   * @returns {number[]} smoothed matrix, column-major
   */
  function filter(matrix, timeMs) {
    if (timeMs - lastTime > RESET_AFTER_MS) reset();
    const dt = (timeMs - lastTime) / 1000;
    const first = lastTime === -Infinity;
    lastTime = timeMs;

    m.fromArray(matrix).decompose(pos, quat, scale);

    // q and -q are the same rotation. Keep each new quaternion on the same
    // side as the previous one, or the filter would average two opposite
    // values and the glasses would spin through the middle.
    if (!first && quat.dot(prevQuat) < 0) {
      quat.set(-quat.x, -quat.y, -quat.z, -quat.w);
    }

    pos.set(
      posFilters[0].filter(pos.x, dt),
      posFilters[1].filter(pos.y, dt),
      posFilters[2].filter(pos.z, dt),
    );
    quat.set(
      rotFilters[0].filter(quat.x, dt, ROTATION_BETA_SCALE),
      rotFilters[1].filter(quat.y, dt, ROTATION_BETA_SCALE),
      rotFilters[2].filter(quat.z, dt, ROTATION_BETA_SCALE),
      rotFilters[3].filter(quat.w, dt, ROTATION_BETA_SCALE),
    ).normalize(); // filtering components separately drifts off unit length
    prevQuat.copy(quat);

    return m.compose(pos, quat, scale).toArray();
  }

  return { filter, reset };
}
