# Virtual Glasses Try-On

Try on 3D glasses live through your webcam, in the browser. Built from scratch
(Option A of the Ascend Tech AI Engineer Intern assessment) with MediaPipe Face
Landmarker for face tracking and Three.js for rendering. Everything runs on
your device: no server, no uploads.

- **Live demo:** https://mar-wan-e.github.io/virtual-glasses-project/ (use desktop Chrome; allow the camera)
- **Demo video:** TODO(you): link
- **AI prompts used:** [AI_PROMPTS.md](AI_PROMPTS.md)

> TODO(you): add a screenshot or GIF here.

## Features

- Live webcam try-on, mirrored like a selfie, with 3 glasses designs and instant switching
- 3D glasses that follow head rotation, tilt and distance
- **Fits each face automatically:** the lenses are locked to your eyes, the frame
  is sized to your face width, and the temple arms bend to reach your ears and
  hook behind them
- Realistic rendering: glossy and metal frames, tinted see-through lenses,
  reflections, and lighting that follows your room's brightness
- Arms disappear behind your head and ears when you turn
- Smooth tracking: no jitter when still, no lag when moving
- 2D PNG mode as a fallback and for comparison
- Live stats panel (FPS, inference time, end-to-end latency) and a 30-second CSV recorder
- Clear messages for: no camera, permission denied, camera covered, no face

## Run it locally

Requires Node.js 20+ and a webcam.

```bash
npm install      # also copies MediaPipe's WASM runtime into public/wasm
npm run dev      # then open the printed URL in Chrome
npm run build    # static build in dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Controls

| Control | What it does |
|---|---|
| Thumbnails / `G` | Switch glasses |
| `M` | 3D / 2D mode |
| `S` | Show / hide the stats panel |
| Stats panel → *Record 30 s CSV* | Measure performance (name the scenario first) |
| `D` | Debug view: face landmarks, invisible head and ears, tuning sliders |
| `P` (debug) | Auto-fit on / off, to compare with MediaPipe's average face |

## How it works

Every camera frame goes through one pipeline, all in the browser:

1. **Frame arrives.** `requestVideoFrameCallback` fires once per new camera
   frame and gives its capture time. The frame is drawn onto a canvas in the
   same step as the glasses, so video and glasses always show the same moment.
2. **Face tracking.** MediaPipe Face Landmarker (GPU) returns 478 face
   landmarks and a 4×4 *facial transformation matrix*: the head's rotation and
   position, found by fitting MediaPipe's average 3D "canonical face" to the
   landmarks.
3. **Smoothing.** A One Euro filter smooths the head rotation and distance. It
   smooths heavily when the head is still (no jitter) and barely when it moves
   (no lag).
4. **Auto-fit to this face.** MediaPipe's pose assumes an average face, so:
   - **Position** is locked every frame to the centre of the user's four eye
     corners. This happens after smoothing, so the glasses never trail behind,
     and eye corners don't move when you look around.
   - **Face width** (temple landmarks) and **ear height** (where the face meets
     the ears) are compared with the average face under the same pose. They're
     measured only while facing the camera, averaged, then locked (~1.5 s).
   - **Temple arms** are bent at the hinge to run outside the temples to the top
     of the ear, then curve down behind it.
5. **Hiding what's behind the head.** An invisible copy of the head (MediaPipe's
   face mesh, a skull shape and two ears, sized to the user) is drawn first and
   writes only depth. Any part of the glasses behind it, like the far arm or the
   arm tips behind the ears, isn't drawn.
6. **Rendering.** Three.js draws the glasses with physically based materials and
   a studio reflection map. Light intensity follows the room's brightness,
   sampled from the video every 10 frames. The camera uses MediaPipe's 63° field
   of view, so 3D and video line up.

Files (`src/`): `main.js` (frame loop) · `camera.js` · `tracker.js` ·
`smoothing.js` · `facefit.js` · `renderer3d.js` · `renderer2d.js` ·
`glasses.js` (designs and tuning values) · `ui.js` · `metrics.js` ·
`canonicalFace.js` (MediaPipe face mesh, for the invisible head).

## Tech choices and why

| Choice | Why |
|---|---|
| **Browser, not Python/OpenCV** | The brief asks for a working demo link: a web page is one click for anyone. In the browser MediaPipe runs on the GPU (its Python package is CPU-only on Windows), and there's no server round trip to add latency. |
| **MediaPipe Face Landmarker** | 478 landmarks plus a 3D head pose per frame, real-time on a laptop, pretrained (no training data needed). |
| **3D head pose, not just 2D landmarks** | 2D placement can only scale, move and roll a flat image; it can't turn the glasses with the head or hide the far arm. The 2D mode stays in the app for comparison. |
| **Three.js** | Mature WebGL renderer with glTF loading, physical materials, environment maps and depth-only materials (for the invisible head). |
| **One Euro filter** | The standard filter for interactive tracking: adapts its smoothing to speed, so it gives low jitter and low lag together. ~40 lines, no dependency. |
| **Pin after smoothing** | Smoothing position always adds some lag; locking the position to the current frame's eyes removes it, while rotation stays smooth. |
| **Vite + vanilla JS** | Fast dev server, one-command static build, no framework to explain. |
| **GitHub Pages** | Free HTTPS hosting (browsers only allow camera access over HTTPS). |

## Performance

**How it's measured** (`src/metrics.js`, visible live in the stats panel):
- **FPS:** camera frames fully processed per second.
- **Inference:** time inside MediaPipe's `detectForVideo` for one frame.
- **End-to-end latency:** from the camera's capture time
  (`requestVideoFrameCallback` → `captureTime`) to when the frame with its
  glasses reaches the screen (estimated as the next display refresh after
  drawing, via two `requestAnimationFrame` calls; accurate to about one refresh,
  ~16 ms). Includes the camera's own delay; excludes the monitor's.
- p50 = typical frame, p95 = worst 5% of frames. Each row is a 30 s capture in 3D mode.

**Targets from the brief:** 24+ FPS, under 100 ms end-to-end.

**Test machine:** TODO(you): CPU, GPU, RAM, OS, browser + version, webcam
model and resolution.

| Scenario | Device / browser | FPS (avg) | Inference ms (p50 / p95) | Latency ms (p50 / p95) | Alignment notes |
|---|---|---|---|---|---|
| Still, normal light | | | | | |
| Slow head turns and nods | | | | | |
| Fast head turns | | | | | |
| Dim light (one lamp) | | | | | |
| Backlit (window behind) | | | | | |
| Wearing glasses / a hat | | | | | |
| Weaker device: TODO(you) | | | | | |

## Limitations

- **One face at a time.**
- **Side profiles:** tracking is lost beyond roughly 60° head turn.
- **No ear detection:** MediaPipe has no ear landmarks, so ear position is
  estimated from where the face meets the ear. Unusual ear placement can make
  the arm hook land slightly off.
- **Real-world size:** glasses are sized relative to the face, not in true
  millimetres; there's no frame-size recommendation.
- **Rigid models:** temple arms are bent by moving vertices, not by real
  physics, and frames don't flex.
- **Lighting:** brightness only, no light direction or colour; no shadows from
  the glasses onto the face.
- **Fast movement:** on very fast head turns tracking can lag or drop out for a
  frame. Short dropouts (< 200 ms) are hidden by holding the last pose.
- **Latency floor:** the webcam itself (often 30–60 ms) is part of the
  end-to-end number and outside the app's control.
- **Expressions:** the invisible face is MediaPipe's rigid average face, so a
  wide smile or open mouth isn't followed by the occluder (it only affects what
  hides the glasses, not their position).
- TODO(you): anything else you noticed while testing.

## AI tools used

This project was built with AI assistance, as the brief allows:

- **Claude Code** (Anthropic): wrote and refactored the code, ran browser tests
  with synthetic faces, drafted this README.
- **Claude** (Anthropic): planning and the PRD.

Every prompt is in [AI_PROMPTS.md](AI_PROMPTS.md).

TODO(you): in your own words, what you decided, tested and corrected. For
example: the per-face fitting, the arm and ear behaviour, and the smoothing
tuning came from your testing on your own webcam.

## Credits and licences

- **MediaPipe** Face Landmarker model and canonical face mesh, by Google:
  Apache License 2.0.
- **Three.js:** MIT License.
- **Glasses models** (Sketchfab):
  - `glasses-1.glb` (Classic Black): TODO(you): title, author, link, licence
  - `glasses-2.glb` (Blue Sun): TODO(you): title, author, link, licence
  - `glasses-3.glb` (Angular Black): TODO(you): title, author, link, licence
- The 2D PNGs are renders of these same models.
