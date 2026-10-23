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
  smoothing.js      // One Euro filter
  renderer3d.js     // Three.js scene, glasses anchor, occluder, lights
  renderer2d.js     // PNG overlay fallback
  glasses.js        // catalogue: model paths, offsets, scale per design
  ui.js             // picker, mode toggle, stats panel, messages
  metrics.js        // FPS, inference ms, latency, CSV export
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
  - 3D: sliders for offset x/y/z, scale and FOV, a "Copy values" button, pink
    markers at the canonical eye corners + nose bridge (they should sit on
    the matching green dots; if not, the FOV is off), and head distance in cm.
  - Values reset on reload; copy them into `glasses.js`.
- `G` — next glasses design (temporary until the Phase 4 picker).
- `M` — switch 2D / 3D mode (3D is the default).

## 3D notes

- The facial transformation matrix maps MediaPipe's canonical face (cm; +y
  up, +z out of the face; eye corners at x = ±4.45, eye level y ≈ 2.6,
  nose bridge 168 at (0, 3.27, 5.24)) into camera space. Verified on a test
  face: canonical markers land on the 2D landmarks with FOV 63.
- Matrix data is column-major (`Matrix4.fromArray`); renderer3d.js transposes
  automatically if it ever arrives row-major.
- Each model is shifted so its origin is the lens centre at the lens front,
  then scaled to `scale3d` x 8.9 cm wide; `offset3d` places that point.
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
