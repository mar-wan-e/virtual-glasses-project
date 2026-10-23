// smoothing.js — One Euro filter for jitter-free, low-lag head pose.
// Phase 4: a low-pass filter whose cutoff rises with speed, so the pose is
// heavily smoothed when the head is still and responsive when it moves.
//   minCutoff: lower = less jitter when still (but more lag)
//   beta:      higher = less lag during fast movement (but more jitter)

/**
 * Creates a filter for a full pose (position xyz + rotation quaternion).
 * @param {{ minCutoff?: number, beta?: number }} [options]
 * @returns {{ filter: (pose: object, timestampMs: number) => object, reset: () => void }}
 */
export function createPoseFilter(options = {}) {
  // TODO (Phase 4): one 1D One Euro filter per component; re-normalise quaternion.
  void options;
  return {
    filter: (pose) => pose, // pass-through until implemented
    reset: () => {},
  };
}
