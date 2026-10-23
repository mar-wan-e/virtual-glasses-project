// tracker.js — MediaPipe Face Landmarker setup and per-frame detection.
// Phase 1: load face_landmarker.task from /models, VIDEO running mode,
// GPU delegate, 1 face, with facial transformation matrices enabled.

/**
 * Loads the Face Landmarker model. Call once before detect().
 * @returns {Promise<void>}
 */
export async function initTracker() {
  // TODO (Phase 1): FilesetResolver + FaceLandmarker.createFromOptions.
}

/**
 * Runs face detection on the current video frame.
 * @param {HTMLVideoElement} video
 * @param {number} timestampMs - monotonically increasing frame timestamp
 * @returns {{ landmarks: Array, matrix: Float32Array } | null}
 *   478 normalised landmarks plus the 4x4 head-pose matrix, or null if no face
 */
export function detect(video, timestampMs) {
  // TODO (Phase 1): faceLandmarker.detectForVideo(video, timestampMs).
  void video;
  void timestampMs;
  return null;
}
