# AI Prompts

Every prompt sent to AI tools during development, in order. Prompts edited
for clarity.

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
how do I get the 3glb glasses models and 3 transparent pngs
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

## Phase 4: Realism, smoothing, three designs

### Prompt 6 (Claude Code)

```
 Add a head occluder: a head-shaped mesh (simple ellipsoid or MediaPipe's
canonical face geometry) attached to the same anchor, material with
colorWrite false so it only writes depth, renderOrder before the glasses.
2. Implement a One Euro filter in smoothing.js for position (3 axes) and
rotation
(quaternion components, re-normalised), with minCutoff and beta exposed as
debug sliders.
3. Materials: MeshPhysicalMaterial for frames, lenses with transmission or
opacity
~0.25 and slight tint, RoomEnvironment env map via PMREMGenerator.
4. Every 10 frames, sample mean brightness of a downscaled video frame and
lerp
ambient and directional light intensity toward it.
5. Picker UI with thumbnails for 3 designs and a 2D/3D toggle; preload all
models.
```

### Prompt 7 (Claude Code)

```
what does shimmering mean, and the glasses dont keep up at the fastest speed
```

```
if i move my head fast beta maxed out isn't enough to make it stay on my face. consider locking on specific points of my face like my eye corners.
```

(Claude Code widened the minCutoff/beta slider ranges, then found the trailing
wasn't the filter: the <video> element shows new frames immediately while the
glasses use the pose from the frame being analysed. It now draws each frame
onto a canvas in the same step as the glasses, so they stay in sync.)

### Prompt 8 (Claude Code)

```
how much should occluder width be set to
```

```
All errors have been fixed but the ear. It isn't set correctly
```

(Claude Code explained how to tune occluder width, then added per-design
"tilt" (rotation x) and "arm length" (z-only scale) sliders so the rigid
temple arms can be angled and stretched to reach the ears.)

### Prompt 9 (Claude Code)

```
it doesnt tuck behind my ear.
```

(Claude Code added invisible depth-only ear shapes to the head occluder, with
ear x/y/z sliders, so the end of each temple arm is hidden behind the ear.)

### Prompt 10 (Claude Code)

```
its still unrealistic.
```

(Answered a multiple-choice question: "Moves wrong" and "Wrong size or
position". Claude Code added nose-bridge pinning: keep MediaPipe's rotation
and depth, but shift the pose so the canonical nose bridge lands exactly on
landmark 168, before smoothing. P toggles it for comparison.)

### Prompt 11 (Claude Code)

```
thing is it needs to be dynamic. It needs to change for everyones face
```

(Claude Code split "model" tuning from "face" fitting: glasses.js now only
describes each model, and each user's face is measured live. New facefit.js
estimates face width from the temple landmarks; pinning now uses the centre of
the eye corners; scale3d became a fraction of the wearer's face width. Tested
on four synthetic faces, including a child, and calibrated a 1.12 baseline
because MediaPipe's outline landmarks read wide on every face.)

### Prompt 12 (Claude Code)

```
Few errors here - the arms dont go to the ears directly secondly, the glasses always move slower then my face. thirdly, keep beta maxed out always. te glasses arent pinned as it moves  when my face moves. when I look straight ahead the glasses arms dont show on the side of my face, and when I turn it, it looks unrealistic
```

(Claude Code: beta defaults to max and the speed estimate reacts 4x faster;
pinning moved after smoothing so the position locks to the eyes every frame;
the temple arms are now bent at the hinge to reach each user's ears, which
also makes them visible beside the face; a 200 ms pose hold stops flicker on
fast turns. Testing on webcam-distance videos showed the earlier 12% width
calibration was a close-up-photo artifact, so it was removed, and that
re-fitting every frame caused dropouts, so the face width now locks after
~1.5 s.)

### Prompt 13 (Claude Code)

```
The issue currently is when i look down the arms dont go down and tilt, they go to the top of my head making it seem unrealistic.
```

(Claude Code: the invisible head was 15% too narrow, so arms showed over the
hair where a real head hides them. It is now full width; the arms are routed
outside the temples to a rest point on top of the ear (1 cm further forward
than before) and the last 2.5 cm curves down 40 degrees behind the ear.)

### Prompt 14 (Claude Code)

```
everything is great - but again it doesn't hook behind my ear
```

(Answered a multiple-choice question: "Ends at the ear, no curve". Claude Code
found the whole curve was hidden inside the invisible ear; it now starts just
before the ear's top edge so the bend is visible going over the ear. It also
added per-face ear height, measured from landmarks 234/454, so the hook lands
on each person's ears.)

## Phase 5: Metrics, docs, delivery

### Prompt 15 (Claude Code)

```
where are we now compared to the goal we need to reach. theres phase 5 left, but what else do we need
```

### Prompt 16 (Claude Code)

```
Implement metrics.js: rolling FPS, inference time per frame (performance.now
around detectForVideo), and end-to-end latency per frame as the gap between
the
frame's captureTime (requestVideoFrameCallback metadata) and the time the
rendered frame is presented. Show p50 and p95 for each in the stats panel,
and add
a button that runs a 30-second capture and downloads the results as CSV.
Then draft a README with: overview, setup, architecture, tech choices and
why,
performance results table (leave numbers for me), limitations, AI tools used.
```

### Prompt 17 (Claude Code)

```
some changes to be made in glasses number 2 and 3, they have different dimensions so they dont tuck behind the ear.
```

(Claude Code measured each model's arm from the side: all three already hook
down at the end, designs 2 and 3 earlier and more steeply. Arm aiming now
uses the straight part's direction, detects where each model's own hook
starts, and stretches only the straight part so the hook begins just before
the ear's top edge.)
