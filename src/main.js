// main.js — app entry point.
// Wires the modules together and owns the per-frame loop:
//   camera frame -> tracker -> 3D renderer (or 2D overlay) -> UI
//   (Phase 4 adds smoothing between tracker and renderer.)

import './style.css';
import { startCamera, onVideoFrame } from './camera.js';
import { initTracker, detect, drawLandmarks } from './tracker.js';
import { initRenderer2D, resizeRenderer2D, render2D } from './renderer2d.js';
import { initRenderer3D, render3D, applyFit, setFov, headDistance } from './renderer3d.js';
import { GLASSES, CAMERA_FOV } from './glasses.js';
import { createFpsCounter } from './metrics.js';
import * as ui from './ui.js';

// How many consecutive frames without a face before showing the "no face"
// message (~0.5 s at 30 FPS), so a single missed frame doesn't flash it.
const NO_FACE_FRAMES = 15;

// If no camera frame arrives for this long, the camera has stopped sending
// (covered privacy shutter, unplugged, or taken by another app).
const STALL_MS = 1000;

// Debug sliders for the 3D fit. Offsets are in canonical-face centimetres.
const SLIDERS = [
  { key: 'x', label: 'offset x', min: -3, max: 3, step: 0.05 },
  { key: 'y', label: 'offset y', min: 0, max: 6, step: 0.05 },
  { key: 'z', label: 'offset z', min: 2, max: 10, step: 0.05 },
  { key: 'scale', label: 'scale', min: 1, max: 2, step: 0.01 },
  { key: 'fov', label: 'FOV°', min: 30, max: 90, step: 0.5 },
];

const video = document.getElementById('video');
const view = document.getElementById('view');
const debugCanvas = document.getElementById('debug-canvas');
const debugCtx = debugCanvas.getContext('2d');

const fpsCounter = createFpsCounter();
let trackerReady; // Promise<'GPU' | 'CPU'>, started at page load
let pngsReady; // Promise<void>, 2D glasses images preloading
let modelsReady; // Promise<void>, 3D glasses models preloading
let delegate = '';
let debug = false;
let mode = '3d'; // '3d' = GLB models on the head pose, '2d' = PNG overlay
let fov = CAMERA_FOV;
let designIndex = 0; // which entry of GLASSES is worn
let framesWithoutFace = 0;
let lastFrameAt = 0; // performance.now() of the last processed frame

/**
 * Starts loading the face model and all glasses assets straight away, so
 * they're usually ready by the time the user has clicked Start.
 */
function bootstrap() {
  trackerReady = initTracker();
  pngsReady = initRenderer2D(view, GLASSES);
  modelsReady = initRenderer3D(view, GLASSES, fov);
  // Errors are reported in start(); these stop "unhandled rejection" warnings.
  for (const p of [trackerReady, pngsReady, modelsReady]) p.catch(() => {});

  ui.initUI({
    onStart: start,
    onToggleDebug: toggleDebug,
    onNextGlasses: nextGlasses,
    onToggleMode: toggleMode,
    onTune: tune2D,
  });
  ui.initSliders(SLIDERS, onSlider, copyFitValues);
  showDesign();
  ui.setDebugAndMode(debug, mode);
  ui.showMessage('Click "Start camera" to try on glasses.');
}

/**
 * Click handler for the start button: opens the camera, waits for the model
 * and glasses assets, sizes the overlays to the video and starts the loop.
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

  // Match the view box and 2D canvases to the real camera resolution (the
  // camera may not honour the 1280x720 request exactly). The 3D canvas
  // follows the view box on its own via a ResizeObserver.
  view.style.setProperty('--ar', `${video.videoWidth} / ${video.videoHeight}`);
  debugCanvas.width = video.videoWidth;
  debugCanvas.height = video.videoHeight;
  resizeRenderer2D(video.videoWidth, video.videoHeight);

  ui.showMessage('Loading face tracking model…');
  try {
    [delegate] = await Promise.all([trackerReady, pngsReady, modelsReady]);
  } catch (err) {
    console.error(err);
    ui.showMessage('Could not load the face model or glasses. Check your connection and reload.');
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
  render3D(null, null, false);
  ui.setFps(0, delegate);
  ui.showMessage('No video from the camera. Is it covered or switched off?');
}

/**
 * Runs once per camera frame: detect the face, draw the glasses (2D or 3D)
 * and the debug view, update the no-face message and the FPS label.
 * @param {{ now: number, captureTime: number }} frame
 */
function processFrame({ now }) {
  lastFrameAt = performance.now();
  const face = detect(video, now);
  const design = GLASSES[designIndex];

  // Only one renderer shows glasses; passing null makes the other one clear.
  render2D(face?.landmarks ?? null, mode === '2d' ? design : null);
  render3D(face?.matrix ?? null, mode === '3d' ? design.id : null, debug && mode === '3d');

  debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  if (debug && face) drawLandmarks(debugCtx, face.landmarks);

  framesWithoutFace = face ? 0 : framesWithoutFace + 1;
  ui.showMessage(
    framesWithoutFace >= NO_FACE_FRAMES
      ? 'No face detected. Face the camera in good light.'
      : '',
  );

  // In 3D debug, also show how far away MediaPipe thinks the head is: a quick
  // check that the pose matrix makes sense (a webcam user is ~40-80 cm away).
  const extra = debug && mode === '3d' && face?.matrix ? `head ${headDistance().toFixed(0)} cm` : '';
  ui.setFps(fpsCounter.tick(now), delegate, extra);
}

/** Shows or hides the landmark dots and the tuning panel for the mode. */
function toggleDebug() {
  debug = !debug;
  ui.setDebugAndMode(debug, mode);
}

/** Switches between 3D models and the 2D PNG overlay. */
function toggleMode() {
  mode = mode === '3d' ? '2d' : '3d';
  ui.setDebugAndMode(debug, mode);
}

/** Switches to the next glasses design (wraps around). */
function nextGlasses() {
  designIndex = (designIndex + 1) % GLASSES.length;
  showDesign();
}

/** Updates the button label and both tuning panels for the current design. */
function showDesign() {
  const d = GLASSES[designIndex];
  ui.setGlassesLabel(d.name);
  ui.setTuning(d);
  ui.setSliderValues(`${d.id} (3D fit)`, {
    x: d.offset3d.x, y: d.offset3d.y, z: d.offset3d.z, scale: d.scale3d, fov,
  });
}

/**
 * Nudges the current design's 2D fit live. Changes last until reload; copy
 * the values shown on screen into glasses.js to keep them.
 * @param {number} dScale - change to scale2d
 * @param {number} dBridgeY - change to bridgeY2d
 */
function tune2D(dScale, dBridgeY) {
  const d = GLASSES[designIndex];
  d.scale2d = Math.max(0.5, d.scale2d + dScale);
  d.bridgeY2d = Math.min(1, Math.max(0, d.bridgeY2d + dBridgeY));
  ui.setTuning(d);
}

/**
 * A 3D slider moved: update the current design (or the shared FOV) live.
 * @param {string} key - 'x' | 'y' | 'z' | 'scale' | 'fov'
 * @param {number} value
 */
function onSlider(key, value) {
  const d = GLASSES[designIndex];
  if (key === 'fov') {
    fov = value;
    setFov(fov);
    return;
  }
  if (key === 'scale') d.scale3d = value;
  else d.offset3d[key] = value;
  applyFit(d);
}

/**
 * Formats the current design's 3D fit (and the FOV) as code to paste into
 * glasses.js.
 * @returns {string}
 */
function copyFitValues() {
  const d = GLASSES[designIndex];
  const r = (n) => Number(n.toFixed(2));
  const o = d.offset3d;
  return (
    `// ${d.id}\n` +
    `scale3d: ${r(d.scale3d)},\n` +
    `offset3d: { x: ${r(o.x)}, y: ${r(o.y)}, z: ${r(o.z)} },\n` +
    `// shared: export const CAMERA_FOV = ${r(fov)};`
  );
}

bootstrap();
