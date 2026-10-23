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
```

## Commands

- `npm run dev` — dev server
- `npm run build` — static build into `dist/`
- `npm run preview` — serve the build locally

## Working rules

- Work one build phase at a time (Phase 0 setup -> 5 metrics/docs); don't jump ahead.
- Keep modules small and single-purpose; every exported function gets a doc
  comment explaining what it does and why, so the author can explain it in the interview.
- No backend and no network calls besides loading static assets.
- Track one face only. Use MediaPipe's pretrained model as-is.
- The author checks visual alignment and realism on their own webcam; Claude Code
  cannot see it, so ask for observations rather than assuming it looks right.
- Every prompt is logged in `AI_PROMPTS.md`.
