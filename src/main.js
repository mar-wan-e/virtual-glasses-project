// main.js — app entry point.
// Wires the modules together and owns the per-frame loop:
//   camera frame -> tracker -> One Euro smoothing -> 3D renderer -> UI
//                           \-> 2D overlay (fallback mode, raw landmarks)

import './style.css';
import { startCamera, onVideoFrame } from './camera.js';
import { initTracker, detect, drawLandmarks } from './tracker.js';
import { createPoseFilter, createPointFilter } from './smoothing.js';
import { createFaceFit } from './facefit.js';
import { initRenderer2D, resizeRenderer2D, render2D } from './renderer2d.js';
import {
  initRenderer3D, render3D, applyFit, setFov, setOccluder,
  updateLighting, getLightLevel, headDistance, pinToEyes, eyeCentre, measureFace, setFaceFit,
} from './renderer3d.js';
import { GLASSES, CAMERA_FOV, SMOOTHING, OCCLUDER } from './glasses.js';
import { createFpsCounter } from './metrics.js';
import * as ui from './ui.js';

// How many consecutive frames without a face before showing the "no face"
// message (~0.5 s at 30 FPS), so a single missed frame doesn't flash it.
const NO_FACE_FRAMES = 15;

// If no camera frame arrives for this long, the camera has stopped sending
// (covered privacy shutter, unplugged, or taken by another app).
const STALL_MS = 1000;

// Keep showing the glasses at their last pose if the face is lost for less
// than this (a brief tracking dropout on a fast head turn).
const HOLD_POSE_MS = 200;


// Debug sliders for 3D. The first four are per design (offsets in
// canonical-face centimetres); the rest are shared by all designs.
const SLIDERS = [
  { key: 'x', label: 'offset x', min: -3, max: 3, step: 0.05 },
  { key: 'y', label: 'offset y', min: 0, max: 6, step: 0.05 },
  { key: 'z', label: 'offset z', min: 2, max: 10, step: 0.05 },
  { key: 'scale', label: 'scale', min: 0.6, max: 1.3, step: 0.01 },
  { key: 'tilt', label: 'tilt°', min: -20, max: 20, step: 0.5 },
  { key: 'arm', label: 'arm length', min: 0.6, max: 1.6, step: 0.01 },
  { key: 'fov', label: 'FOV°', min: 30, max: 90, step: 0.5 },
  { key: 'minCutoff', label: 'minCutoff', min: 0.1, max: 10, step: 0.05 },
  { key: 'beta', label: 'beta', min: 0, max: 1, step: 0.005 },
  { key: 'occZ', label: 'occluder z', min: -2, max: 1, step: 0.05 },
  { key: 'occW', label: 'occl. width', min: 0.6, max: 1.1, step: 0.01 },
  { key: 'earX', label: 'ear x', min: 5.5, max: 9, step: 0.05 },
  { key: 'earY', label: 'ear y', min: -2, max: 4, step: 0.05 },
  { key: 'earZ', label: 'ear z', min: -8, max: 0, step: 0.05 },
];

const video = document.getElementById('video');
const view = document.getElementById('view');
const videoCanvas = document.getElementById('video-canvas');
const videoCtx = videoCanvas.getContext('2d', { alpha: false }); // opaque: covers the <video>
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
const occluder = { ...OCCLUDER, ear: { ...OCCLUDER.ear } }; // live copy, edited by the sliders
const smoothing = { ...SMOOTHING }; // live copy: sliders edit it, the filter reads it
const poseFilter = createPoseFilter(smoothing);
const eyeFilter = createPointFilter(); // eye centre the glasses are locked to
let designIndex = 0; // which entry of GLASSES is worn
let autoFit = true; // fit glasses to each face automatically (P toggles, for comparison)
const faceFit = createFaceFit(); // running estimate of this face's width
let framesWithoutFace = 0;
let lastFrameAt = 0; // performance.now() of the last processed frame
let lastPose = null; // last 3D pose shown, for HOLD_POSE_MS
let lastPoseAt = 0;

/**
 * Starts loading the face model and all glasses assets straight away, so
 * they're usually ready by the time the user has clicked Start.
 */
function bootstrap() {
  trackerReady = initTracker();
  pngsReady = initRenderer2D(view, GLASSES);
  modelsReady = initRenderer3D(view, GLASSES, { fov, occluder });
  // Errors are reported in start(); these stop "unhandled rejection" warnings.
  for (const p of [trackerReady, pngsReady, modelsReady]) p.catch(() => {});

  ui.initUI({
    onStart: start,
    onToggleDebug: toggleDebug,
    onNextGlasses: nextGlasses,
    onToggleMode: toggleMode,
    onTune: tune2D,
    onTogglePin: toggleAutoFit,
  });
  ui.initSliders(SLIDERS, onSlider, copyFitValues);
  ui.initPicker(GLASSES, selectGlasses);
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
  videoCanvas.width = video.videoWidth;
  videoCanvas.height = video.videoHeight;
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

  // Show this exact frame on our own canvas, in the same step that draws the
  // glasses for it. A plain <video> would display newer frames as soon as they
  // arrive, while the glasses still show the pose from the frame being
  // analysed, so on fast head turns the glasses would visibly trail the face.
  videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);

  const face = detect(video, now);
  const design = GLASSES[designIndex];

  // Only one renderer shows glasses; passing null makes the other one clear.
  render2D(face?.landmarks ?? null, mode === '2d' ? design : null);
  if (mode === '3d') {
    // 1. Smooth the head pose (rotation + distance) so the glasses don't
    //    jitter (see smoothing.js).
    // 2. Auto-fit to this person's face:
    //    a. lock the position to their eye centre for THIS frame, so the
    //       lenses sit on their eyes and never trail behind (see pinToEyes);
    //    b. measure their face width and resize the glasses, arms and
    //       invisible head to match (see facefit.js).
    let pose = null;
    if (face?.matrix) {
      pose = poseFilter.filter(face.matrix, now);
      if (autoFit) {
        pose = pinToEyes(pose, eyeFilter.filter(eyeCentre(face.landmarks), now));
        setFaceFit(faceFit.update(measureFace(pose, face.landmarks), now));
      }
      lastPose = pose;
      lastPoseAt = now;
    } else if (lastPose && now - lastPoseAt < HOLD_POSE_MS) {
      // Tracking can drop out for a frame or two on a very fast head turn.
      // Keep the glasses where they were instead of flickering them off.
      pose = lastPose;
    }
    updateLighting(video);
    render3D(pose, design.id, debug);
  } else {
    render3D(null, null, false);
  }

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
  // Also show the light level the room brightness has set (1 = normal).
  const extra = debug && mode === '3d' && face?.matrix
    ? `head ${headDistance().toFixed(0)} cm · light ${getLightLevel().toFixed(2)} · ` +
      `face ${faceFit.value().ratio.toFixed(2)}× · ears ${faceFit.value().earOffsetY.toFixed(1)} cm · auto-fit ${autoFit ? 'on' : 'off'} (P)`
    : '';
  ui.setFps(fpsCounter.tick(now), delegate, extra);
}

/** Shows or hides the landmark dots and the tuning panel for the mode. */
function toggleDebug() {
  debug = !debug;
  ui.setDebugAndMode(debug, mode);
}

/**
 * Turns auto-fit (eye pinning + face-width sizing) on/off, to compare with
 * the raw MediaPipe pose on an average face.
 */
function toggleAutoFit() {
  autoFit = !autoFit;
  if (!autoFit) setFaceFit({ ratio: 1, earOffsetY: 0 }); // back to the average face
  else setFaceFit(faceFit.value());
}

/** Switches between 3D models and the 2D PNG overlay. */
function toggleMode() {
  mode = mode === '3d' ? '2d' : '3d';
  ui.setDebugAndMode(debug, mode);
}

/** Switches to the next glasses design (G key; wraps around). */
function nextGlasses() {
  selectGlasses((designIndex + 1) % GLASSES.length);
}

/**
 * Picker click. All models and PNGs are preloaded, so this only changes which
 * one is visible: instant, and tracking never pauses.
 * @param {number} index - entry in GLASSES
 */
function selectGlasses(index) {
  designIndex = index;
  showDesign();
}

/** Updates the picker and both tuning panels for the current design. */
function showDesign() {
  const d = GLASSES[designIndex];
  ui.setSelectedGlasses(designIndex);
  ui.setTuning(d);
  ui.setSliderValues(`${d.name} (3D)`, {
    x: d.offset3d.x, y: d.offset3d.y, z: d.offset3d.z, scale: d.scale3d,
    tilt: d.rotation3d.x, arm: d.armLength,
    fov, minCutoff: smoothing.minCutoff, beta: smoothing.beta, occZ: occluder.z, occW: occluder.width,
    earX: occluder.ear.x, earY: occluder.ear.y, earZ: occluder.ear.z,
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
 * A 3D slider moved: update the current design, or a shared setting, live.
 * @param {string} key - see SLIDERS
 * @param {number} value
 */
function onSlider(key, value) {
  const d = GLASSES[designIndex];
  switch (key) {
    case 'fov': fov = value; setFov(fov); return;
    case 'minCutoff': smoothing.minCutoff = value; return;
    case 'beta': smoothing.beta = value; return;
    case 'occZ': occluder.z = value; setOccluder(occluder); return;
    case 'occW': occluder.width = value; setOccluder(occluder); return;
    case 'earX': occluder.ear.x = value; setOccluder(occluder); return;
    case 'earY': occluder.ear.y = value; setOccluder(occluder); return;
    case 'earZ': occluder.ear.z = value; setOccluder(occluder); return;
    case 'scale': d.scale3d = value; break;
    case 'tilt': d.rotation3d.x = value; break;
    case 'arm': d.armLength = value; break;
    default: d.offset3d[key] = value; // 'x' | 'y' | 'z'
  }
  applyFit(d);
}

/**
 * Formats the current design's 3D fit and the shared settings as code to
 * paste into glasses.js.
 * @returns {string}
 */
function copyFitValues() {
  const d = GLASSES[designIndex];
  const r = (n, digits = 2) => Number(n.toFixed(digits));
  const o = d.offset3d;
  return (
    `// ${d.id}\n` +
    `scale3d: ${r(d.scale3d)},\n` +
    `offset3d: { x: ${r(o.x)}, y: ${r(o.y)}, z: ${r(o.z)} },\n` +
    `rotation3d: { x: ${r(d.rotation3d.x, 1)}, y: ${r(d.rotation3d.y, 1)}, z: ${r(d.rotation3d.z, 1)} },\n` +
    `armLength: ${r(d.armLength)},\n` +
    `// shared:\n` +
    `export const CAMERA_FOV = ${r(fov)};\n` +
    `export const SMOOTHING = { minCutoff: ${r(smoothing.minCutoff)}, beta: ${r(smoothing.beta, 3)}, dCutoff: ${r(smoothing.dCutoff)} };\n` +
    `export const OCCLUDER = { z: ${r(occluder.z)}, width: ${r(occluder.width)}, ` +
    `ear: { x: ${r(occluder.ear.x)}, y: ${r(occluder.ear.y)}, z: ${r(occluder.ear.z)} } };`
  );
}

bootstrap();
