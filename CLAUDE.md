# Virtual Glasses Try-On (Option A)

Browser-based virtual eyeglasses try-on built from scratch for the Ascend Tech
AI Engineer Intern assessment. MediaPipe Face Landmarker tracks the face;
Three.js renders 3D glasses anchored to the head pose; a 2D PNG overlay is the
fallback mode.

## Goals

- **24+ FPS** on a typical laptop webcam
- **< 100 ms end-to-end latency** (camera capture -> rendered frame)
- **Runs fully client-side**: no backend, no server round-trip, static deploy
- Glasses stay aligned during natural head movement and look natural in varied lighting
- At least 3 switchable glasses designs; simple one-screen UI

## Stack

| Layer | Choice |
|---|---|
| Build tool | Vite + vanilla JavaScript |
| Face tracking | `@mediapipe/tasks-vision` Face Landmarker, VIDEO mode, GPU delegate (478 landmarks + 4x4 facial transformation matrix) |
| Rendering | Three.js + GLTFLoader (PBR materials, env map, depth-only head occluder) |
| Smoothing | Hand-written One Euro filter |
| Assets | 3 CC-licensed GLB models + 3 transparent PNGs, in `public/models/` |
| Hosting | GitHub Pages or Vercel |

## Per-frame pipeline

1. Webcam frame arrives (`requestVideoFrameCallback`, capture timestamp recorded)
2. Face Landmarker `detectForVideo` -> landmarks + transformation matrix
3. One Euro filter smooths position and rotation
4. Glasses anchor and head occluder take the smoothed pose
5. Light intensity follows the frame's mean brightness (every ~10 frames)
6. Render video background + glasses; update stats overlay

## File layout

```
index.html          // stage (#stage) and controls (#ui) containers
src/
  main.js           // bootstrap, render loop
  camera.js         // getUserMedia, mirroring, frame callback
  tracker.js        // Face Landmarker setup + detect
  facefit.js        // per-user face width estimate (auto-fit)
  canonicalFace.js  // MediaPipe canonical face mesh (generated), for the occluder
  smoothing.js      // One Euro filter
  renderer3d.js     // Three.js scene, glasses anchor, occluder, lights
  renderer2d.js     // PNG overlay fallback
  glasses.js        // catalogue: model paths, offsets, scale per design
  ui.js             // picker, mode toggle, stats panel, messages
  metrics.js        // FPS, inference ms, latency p50/p95, 30 s CSV capture
  style.css
public/models/      // .glb files, .png glasses, face_landmarker.task
public/wasm/        // MediaPipe WASM runtime (gitignored; copied on npm install)
scripts/
  copy-wasm.js      // postinstall: node_modules/@mediapipe/tasks-vision/wasm -> public/wasm
```

## Assets

- `public/models/glasses-{1,2,3}.glb` from Sketchfab (credits go in README).
  All three: +x = wearer's left-right, +y up, front faces +z (toward a Three.js
  camera), temple arms extend toward -z. Units differ per model (front width
  ~2.99 / 1.08 / 1.24), so normalise scale by measured width, not a fixed factor.
- Lens meshes are separate; their material names contain "Glass".
- Material fixes needed when rendering (found while making the PNGs):
  - Set frames to `side: FrontSide`; Sketchfab exports double-sided and the
    inside of thin shells pokes through as patches (very visible on glasses-2).
  - Raise frame roughness to ~0.3; near-mirror frames reflect RoomEnvironment's
    light panels as hard white blocks.
  - glasses-2 frame is exported semi-transparent (alpha 0.8); render it opaque.
  - Lenses on glasses-2/3 are near-opaque sunglasses; lower opacity so eyes show.
- `public/models/glasses-{1,2,3}.png`: front orthographic renders of the GLBs
  (transparent background, lenses at 35% opacity), so 2D and 3D modes match.

## Commands

- `npm run dev` — dev server
- `npm run build` — static build into `dist/`
- `npm run preview` — serve the build locally

## Deploy

GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`
(repo: mar-wan-e/virtual-glasses-project). The site lives at `/<repo>/`, so the
workflow builds with `--base=/<repo>/`; all asset paths in code must be built
from `import.meta.env.BASE_URL`, never hard-coded as `/models/...`.

## Debug controls

- `D` — debug view: green landmark dots, plus the tuning panel for the mode.
  - 2D: `+`/`-` scale the PNG, up/down move it (readout top-right).
  - 3D: sliders for offset x/y/z and scale (per design), FOV, One Euro
    minCutoff/beta, occluder z/width (shared); a "Copy values" button; pink
    markers at the canonical eye corners + nose bridge (they should sit on
    the matching green dots; if not, the FOV is off); occluder wireframe;
    head distance (cm) and light level in the FPS label.
  - Values reset on reload; copy them into `glasses.js`.
- `G` — next glasses design (the thumbnail picker does the same).
- `M` — switch 2D / 3D mode (3D is the default).
- `S` — show/hide the stats panel (FPS, inference and latency p50/p95, scenario
  name + "Record 30 s CSV"). Latency = captureTime -> next display refresh
  after drawing (double requestAnimationFrame). Shortcuts are ignored while
  typing in the scenario box.

## 3D notes

- The facial transformation matrix maps MediaPipe's canonical face (cm; +y
  up, +z out of the face; eye corners at x = ±4.45, eye level y ≈ 2.6,
  nose bridge 168 at (0, 3.27, 5.24)) into camera space. Verified on a test
  face: canonical markers land on the 2D landmarks with FOV 63.
- Matrix data is column-major (`Matrix4.fromArray`); tracker.js transposes
  automatically if it ever arrives row-major, before smoothing.
- Each model is shifted so its origin is the lens centre at the lens front,
  then scaled to `scale3d` x 8.9 cm wide; `offset3d` places that point.
- Pose smoothing (smoothing.js): One Euro on position (cm) and quaternion
  components (hemisphere-aligned, re-normalised); rotation uses beta x 20
  because quaternion components move ~1/s vs tens of cm/s. Resets after a
  300 ms gap. 2D mode uses raw landmarks (not smoothed).
- Occluder: canonical face mesh (src/canonicalFace.js, generated from
  MediaPipe's canonical_face_model.obj, Apache-2.0) + skull ellipsoid,
  depth-only, renderOrder -1, x-scaled by OCCLUDER.width (1.0) and the face width.
- Per-frame 3D order (main.js): One Euro smoothing of the raw pose (rotation
  + depth; SMOOTHING beta kept at max 1, dCutoff 4 Hz) -> pinToEyes locks
  x/y to the eye-corner centre (33, 133, 362, 263) of THIS frame, lightly
  filtered by createPointFilter -> render. Pinning after smoothing is what
  stops the glasses trailing the face. If the face drops out for < 200 ms
  (HOLD_POSE_MS) the last pose is kept, so fast turns don't flicker.
- Auto-fit width (facefit.js): user's temple width (127-356) / canonical
  temples projected under the same pose, only while facing within 15 deg,
  running average, LOCKED after 45 samples until the face is lost for 2 s.
  Also measures ear height: landmarks 234/454 (face meets ear) vs canonical,
  in cm (earOffsetY, test faces -0.4 to 0.0); shifts the invisible ears and
  the arm rest point. renderer3d.js setFaceFit({ ratio, earOffsetY }).
  Glasses (uniform), occluder width and ear x scale by it; setFaceRatio
  ignores changes < 1%. No calibration constant: at webcam distance the raw
  ratio is ~1.0 (1.02-1.08 on test faces).
- Arms (renderer3d.js aimArms): frame vertices behind the hinge (lens back -
  0.3 cm, |x| > half frame width) are rotated about the hinge toward a rest
  point on top of the ear (ear centre 0.4 in, 2 up, 0.5 forward), moved
  outward if needed so the straight arm clears the temple (landmark 356 +
  0.25 cm), stretched to reach it plus a 3 cm tip. The hook: the arm curves
  55 deg down, pivoting 0.8 cm before the ear's top edge and blended over
  1.6 cm, so the bend shows going over the ear; the part behind the ear is
  hidden by the invisible ear (EAR_SIZE half-sizes 0.8 x 3 x 1.8 cm).
  Occluder is full head width (1.0) so the head
  hides arms where a real head would (e.g. over the hair when looking
  down); ears sit outside the arms (x 8.2). Runs on fit/face-width/ear
  changes only, from stored original vertices; never every frame.
- Testing: close-up portraits (face filling the frame) make MediaPipe think
  the head is ~20 cm away and exaggerate perspective (frames look 50% too
  big, widths read 12% high). Test with the face ~400 px tall in 1280x720.
  Headless Chrome runs at ~4 FPS, so fast-motion tests drop tracking more
  than a real 30 FPS webcam would.
- glasses.js values describe each MODEL (tuned once per design, same for
  everyone); scale3d = fraction of the wearer's temple width (0.9 ~ 14 cm).
- Video sync: each processed frame is drawn onto #video-canvas (covering the
  live <video>, which must stay visible so rVFC keeps firing) in the same step
  as the glasses, so video and glasses always show the same frame.
- Lenses use opacity, not transmission: transmission only refracts scene
  objects, and the video is a DOM element behind the canvas.
- Lighting: mean luma of a 32x18 video sample every 10 frames, / 0.45,
  clamped 0.35-1.5, lerped 25% per sample; scales hemi, key and env intensity.
- Headless test harness (not in repo): Chrome with
  `--use-file-for-fake-video-capture=<face>.y4m` can drive the app with a face.

## Working rules

- Work one build phase at a time (Phase 0 setup -> 5 metrics/docs); don't jump ahead.
- Keep modules small and single-purpose; every exported function gets a doc
  comment explaining what it does and why, so the author can explain it in the interview.
- No backend and no network calls besides loading static assets.
- Track one face only. Use MediaPipe's pretrained model as-is.
- The author checks visual alignment and realism on their own webcam; Claude Code
  cannot see it, so ask for observations rather than assuming it looks right.
- Every prompt is logged in `AI_PROMPTS.md`.
