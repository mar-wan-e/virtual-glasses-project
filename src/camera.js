// camera.js — webcam access and the per-frame callback.
// Mirroring is done in CSS (see style.css, .mirrored) so the video pixels and
// landmark coordinates stay un-mirrored; only what the user sees is flipped.

/**
 * Requests the front webcam at 1280x720 and plays it in `video`.
 * Must be called from a user gesture (button click) so the browser shows the
 * permission prompt.
 * @param {HTMLVideoElement} video - element that will show the stream
 * @returns {Promise<MediaStream>} the active camera stream
 * @throws {Error} with a user-facing message if the camera can't be opened
 */
export async function startCamera(video) {
  // getUserMedia only exists on secure origins (https or localhost).
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access needs a secure (HTTPS) page and a modern browser.');
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user', // front camera on phones; ignored on laptops
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // Ask for 30 FPS explicitly: without it, many laptop webcams pick a
        // slower default (often 15-20 FPS), which caps the whole app.
        frameRate: { ideal: 30 },
      },
    });
  } catch (err) {
    throw new Error(cameraErrorMessage(err));
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true; // stops iOS Safari from going fullscreen
  await video.play();
  return stream;
}

/**
 * Turns a getUserMedia error into a message a user can act on.
 * @param {DOMException} err
 * @returns {string}
 */
function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission denied. Allow camera access in the address bar, then reload.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found. Connect a webcam and reload.';
    case 'NotReadableError':
      return 'The camera is in use by another app. Close it and reload.';
    default:
      return `Could not start the camera (${err?.name ?? 'unknown error'}).`;
  }
}

/**
 * Calls `callback` once for every new video frame until the returned stop
 * function is called.
 *
 * Uses requestVideoFrameCallback, which fires exactly when a new camera frame
 * is ready (unlike requestAnimationFrame, which fires at the display rate and
 * can process the same frame twice). Its metadata includes `captureTime`: when
 * the camera captured the frame, in the same clock as performance.now(). That
 * is the start point for end-to-end latency in metrics.js.
 *
 * @param {HTMLVideoElement} video
 * @param {(frame: { now: number, captureTime: number, hasCaptureTime: boolean }) => void} callback
 *   now: when the callback fired (ms, performance.now clock)
 *   captureTime: when the frame was captured; falls back to `now` if the
 *   browser doesn't report it, which makes latency an underestimate
 *   hasCaptureTime: whether captureTime came from the browser (recorded in
 *   the metrics CSV, so an underestimate is never mistaken for a real value)
 * @returns {() => void} stop function
 */
export function onVideoFrame(video, callback) {
  let running = true;

  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const step = (now, metadata) => {
      if (!running) return;
      const hasCaptureTime = typeof metadata.captureTime === 'number';
      callback({ now, captureTime: hasCaptureTime ? metadata.captureTime : now, hasCaptureTime });
      video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  } else {
    // Fallback: poll at display rate, but only process when the frame changed.
    let lastTime = -1;
    const step = (now) => {
      if (!running) return;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        callback({ now, captureTime: now, hasCaptureTime: false });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  return () => {
    running = false;
  };
}
