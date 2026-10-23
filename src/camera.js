// camera.js — webcam access and the per-frame callback.
// Phase 1: getUserMedia (1280x720, front camera), mirrored preview, and a frame
// loop driven by requestVideoFrameCallback that reports each frame's capture time.

/**
 * Requests the webcam and attaches it to a <video> element.
 * @param {HTMLVideoElement} video - element that will show the stream
 * @returns {Promise<MediaStream>} the active camera stream
 */
export async function startCamera(video) {
  // TODO (Phase 1): navigator.mediaDevices.getUserMedia + permission errors.
  void video;
  throw new Error('startCamera not implemented yet');
}

/**
 * Calls `callback` once per new video frame, with the frame's metadata
 * (including captureTime, used for end-to-end latency in metrics.js).
 * @param {HTMLVideoElement} video
 * @param {(now: number, metadata: object) => void} callback
 */
export function onVideoFrame(video, callback) {
  // TODO (Phase 1): loop with video.requestVideoFrameCallback.
  void video;
  void callback;
}
