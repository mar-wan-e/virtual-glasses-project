# AI Prompts

Every prompt sent to AI tools during development, in order.

AI tools used: Claude Code, Claude.

## Phase 0: Setup

### Prompt 1 (Claude Code)

```
Create a Vite + vanilla JavaScript project for a browser-based virtual
eyeglasses try-on.
Install three and @mediapipe/tasks-vision. Create the file layout in
CLAUDE.md
(main.js, camera.js, tracker.js, smoothing.js, renderer3d.js, renderer2d.js,
glasses.js, ui.js, metrics.js) with stub exports. Write a CLAUDE.md that
summarises
the project goals: 24+ FPS, <100 ms latency, runs fully client-side, no
backend.
Keep code modular and commented so I can explain every function.
```

## Phase 1: Webcam and tracking

### Prompt 2 (Claude Code)

```
Implement camera.js: start webcam on a button click with getUserMedia
(1280x720,
front camera), mirror the preview, and expose a frame loop using
requestVideoFrameCallback that records each frame's capture timestamp.
Implement tracker.js: load the MediaPipe Face Landmarker
(face_landmarker.task,
served from /public/models), runningMode VIDEO, GPU delegate, numFaces 1,
outputFacialTransformationMatrixes true. Add a debug toggle that draws the
478
landmarks on a canvas overlay. Show FPS in the corner. Handle permission
denied
and no-face states with on-screen messages.
```

### Prompt 3 (Claude Code)

```
how do i get the 3glb glasses models and 3 transpparentspgns
```

(Claude Code explained how to find CC-licensed GLBs on Sketchfab; after I
downloaded them it inspected the models and rendered the 3 PNGs from them.)

## Phase 2: 2D fallback and first deploy

### Prompt 4 (Claude Code)

```
Implement renderer2d.js: draw a transparent PNG of glasses over the face.
Use landmarks 33 and 263 (outer eye corners) for width and roll angle, and
landmark 168 (nose bridge) as the anchor. Scale = eye distance x a per-model
factor from glasses.js. Account for the mirrored video. Then add a GitHub
Pages
(or Vercel) deploy config and make sure model files load from the deployed
path.
```

## Phase 3: 3D glasses

### Prompt 5 (Claude Code)

```
Implement renderer3d.js with Three.js: full-screen renderer over the mirrored
video, perspective camera whose FOV matches MediaPipe's canonical face model
assumptions (start at 63 degrees vertical and make it tunable). Create a
glassesAnchor Object3D whose matrix is set each frame from the facial
transformation matrix (handle mirroring). Load a GLB with GLTFLoader, centre
it,
and apply per-model offset, rotation and scale from glasses.js. Add on-screen
sliders (debug only) for offset x/y/z, scale and FOV so I can tune alignment
live,
with a button that prints the values to copy into glasses.js.
```
