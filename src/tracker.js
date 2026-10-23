// tracker.js — MediaPipe Face Landmarker setup and per-frame detection.
// The model finds one face and returns 478 3D landmarks plus a 4x4 facial
// transformation matrix (the head's pose relative to a canonical face model),
// which Phase 3 uses to place the 3D glasses.

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// BASE_URL is "/" in dev and the repo sub-path on GitHub Pages, so asset
// paths keep working after deploy.
const BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${BASE}wasm`; // copied from node_modules by scripts/copy-wasm.js
const MODEL_PATH = `${BASE}models/face_landmarker.task`;

let landmarker = null;
let lastTimestamp = -1;

/**
 * Loads the WASM runtime and the Face Landmarker model. Call once before
 * detect(). Tries the GPU (WebGL) first and falls back to CPU if the GPU
 * delegate can't start, e.g. on machines with WebGL disabled.
 * @returns {Promise<'GPU' | 'CPU'>} the delegate actually in use
 */
export async function initTracker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

  for (const delegate of ['GPU', 'CPU']) {
    try {
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO', // reuses tracking between frames: faster than per-image detection
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false, // expressions not needed
      });
      return delegate;
    } catch (err) {
      if (delegate === 'CPU') throw err;
      console.warn('GPU delegate failed, falling back to CPU:', err);
    }
  }
}

/**
 * Runs face detection on the current video frame.
 * @param {HTMLVideoElement} video
 * @param {number} timestampMs - frame time in ms; VIDEO mode requires it to
 *   strictly increase between calls, so equal or older values are bumped up
 * @returns {{ landmarks: Array<{x:number,y:number,z:number}>, matrix: number[] } | null}
 *   landmarks: 478 points, x/y normalised to 0..1 of the video size
 *   matrix: 16 numbers, the 4x4 head-pose matrix (column-major)
 *   null if no face is in view or the tracker isn't loaded yet
 */
export function detect(video, timestampMs) {
  if (!landmarker) return null;

  const ts = timestampMs > lastTimestamp ? timestampMs : lastTimestamp + 1;
  lastTimestamp = ts;

  const result = landmarker.detectForVideo(video, ts);
  if (!result.faceLandmarks.length) return null;

  return {
    landmarks: result.faceLandmarks[0],
    matrix: result.facialTransformationMatrixes[0]?.data ?? null,
  };
}

/**
 * Debug view: draws every landmark as a small dot on a 2D canvas.
 * The canvas is the same size as the video and mirrored by CSS together with
 * it, so normalised coords map straight to pixels without flipping here.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number}>} landmarks
 */
export function drawLandmarks(ctx, landmarks) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = '#3ce07a';
  for (const p of landmarks) {
    ctx.fillRect(p.x * width - 1, p.y * height - 1, 2, 2);
  }
}
