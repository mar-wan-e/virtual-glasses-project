// main.js — app entry point.
// Wires the modules together and owns the per-frame loop:
//   camera frame -> tracker -> 2D renderer (Phase 3+: smoothing -> 3D) -> UI

import './style.css';
import { startCamera, onVideoFrame } from './camera.js';
import { initTracker, detect, drawLandmarks } from './tracker.js';
import { initRenderer2D, resizeRenderer2D, render2D } from './renderer2d.js';
import { GLASSES } from './glasses.js';
import { createFpsCounter } from './metrics.js';
import * as ui from './ui.js';

// How many consecutive frames without a face before showing the "no face"
// message (~0.5 s at 30 FPS), so a single missed frame doesn't flash it.
const NO_FACE_FRAMES = 15;

// If no camera frame arrives for this long, the camera has stopped sending
// (covered privacy shutter, unplugged, or taken by another app).
const STALL_MS = 1000;

const video = document.getElementById('video');
const view = document.getElementById('view');
const debugCanvas = document.getElementById('debug-canvas');
const debugCtx = debugCanvas.getContext('2d');

const fpsCounter = createFpsCounter();
let trackerReady; // Promise<'GPU' | 'CPU'>, started at page load
let assetsReady; // Promise<void>, glasses PNGs preloading
let delegate = '';
let debug = false;
let designIndex = 0; // which entry of GLASSES is worn
let framesWithoutFace = 0;
let lastFrameAt = 0; // performance.now() of the last processed frame

/**
 * Starts loading the face model and glasses images straight away, so they're
 * usually ready by the time the user has clicked Start and allowed the camera.
 */
function bootstrap() {
  trackerReady = initTracker();
  assetsReady = initRenderer2D(view, GLASSES);
  // Errors are reported in start(); these stop "unhandled rejection" warnings.
  trackerReady.catch(() => {});
  assetsReady.catch(() => {});

  ui.initUI({
    onStart: start,
    onToggleDebug: toggleDebug,
    onNextGlasses: nextGlasses,
    onTune: tune,
  });
  ui.setGlassesLabel(GLASSES[designIndex].name);
  ui.setTuning(GLASSES[designIndex]);
  ui.showMessage('Click "Start camera" to try on glasses.');
}

/**
 * Click handler for the start button: opens the camera, waits for the model
 * and images, sizes the overlays to the video and starts the frame loop.
 */
async function start() {
  ui.setStartEnabled(false);
  ui.showMessage('Starting camera…');

  try {
    await startCamera(video);
  } catch (err) {
    ui.showMessage(err.message);
    ui.setStartEnabled(true); // let the user retry after fixing permissions
    return;
  }

  // Match the view box and overlay canvases to the real camera resolution
  // (the camera may not honour the 1280x720 request exactly).
  view.style.setProperty('--ar', `${video.videoWidth} / ${video.videoHeight}`);
  debugCanvas.width = video.videoWidth;
  debugCanvas.height = video.videoHeight;
  resizeRenderer2D(video.videoWidth, video.videoHeight);

  ui.showMessage('Loading face tracking model…');
  try {
    [delegate] = await Promise.all([trackerReady, assetsReady]);
  } catch (err) {
    console.error(err);
    ui.showMessage('Could not load the face model or glasses images. Check your connection and reload.');
    return;
  }

  ui.showMessage('');
  ui.setRunning();
  lastFrameAt = performance.now();
  onVideoFrame(video, processFrame);
  setInterval(checkForStall, 250);
}

/**
 * Watchdog: processFrame only runs when a new frame arrives, so if the camera
 * stops sending frames nothing would update. This timer runs independently
 * and reports the stall instead of leaving a frozen picture.
 */
function checkForStall() {
  if (performance.now() - lastFrameAt < STALL_MS) return;
  debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  render2D(null, null);
  ui.setFps(0, delegate);
  ui.showMessage('No video from the camera. Is it covered or switched off?');
}

/**
 * Runs once per camera frame: detect the face, draw the glasses and the debug
 * view, update the no-face message and the FPS label.
 * @param {{ now: number, captureTime: number }} frame
 */
function processFrame({ now }) {
  lastFrameAt = performance.now();
  const face = detect(video, now);

  render2D(face?.landmarks ?? null, GLASSES[designIndex]);

  debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  if (debug && face) drawLandmarks(debugCtx, face.landmarks);

  framesWithoutFace = face ? 0 : framesWithoutFace + 1;
  ui.showMessage(
    framesWithoutFace >= NO_FACE_FRAMES
      ? 'No face detected. Face the camera in good light.'
      : '',
  );

  ui.setFps(fpsCounter.tick(now), delegate);
}

/** Shows or hides the landmark dots and the 2D tuning readout. */
function toggleDebug() {
  debug = !debug;
  ui.setDebug(debug);
}

/** Switches to the next glasses design (wraps around). */
function nextGlasses() {
  designIndex = (designIndex + 1) % GLASSES.length;
  ui.setGlassesLabel(GLASSES[designIndex].name);
  ui.setTuning(GLASSES[designIndex]);
}

/**
 * Nudges the current design's 2D fit live. Changes last until reload; copy
 * the values shown on screen into glasses.js to keep them.
 * @param {number} dScale - change to scale2d
 * @param {number} dBridgeY - change to bridgeY2d
 */
function tune(dScale, dBridgeY) {
  const d = GLASSES[designIndex];
  d.scale2d = Math.max(0.5, d.scale2d + dScale);
  d.bridgeY2d = Math.min(1, Math.max(0, d.bridgeY2d + dBridgeY));
  ui.setTuning(d);
}

bootstrap();
