// renderer3d.js — Three.js scene that draws 3D glasses on the head.
//
// How the glasses follow the head:
//   MediaPipe fits its "canonical face" (a fixed 3D face mesh in centimetres)
//   to the detected landmarks and returns a 4x4 facial transformation matrix:
//   the rotation + translation that moves the canonical face to where the real
//   face is, in camera space. Our camera sits at the origin looking down -z
//   with the same field of view MediaPipe assumes, so applying that matrix to
//   an object puts it on the real face as seen by the webcam.
//
// Scene graph:
//   scene
//   └─ glassesAnchor      matrix = facial transformation matrix (per frame)
//      ├─ fit[design]     offset / rotation / scale from glasses.js
//      │  └─ gltf.scene   model, shifted so its lens centre is the origin
//      └─ debugMarkers    canonical eye corners + nose bridge (debug only)
//
// Mirroring: like the 2D overlay, this canvas sits inside #view, which CSS
// flips together with the video, so no mirroring is done in 3D.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Canonical face model positions (cm), from MediaPipe's canonical_face_model.obj.
const CANONICAL = {
  eyeCornerR: new THREE.Vector3(-4.445859, 2.663991, 3.173422), // landmark 33
  eyeCornerL: new THREE.Vector3(4.445859, 2.663991, 3.173422), // landmark 263
  noseBridge: new THREE.Vector3(0, 3.271027, 5.236015), // landmark 168
};
const EYE_CORNER_DIST = CANONICAL.eyeCornerR.distanceTo(CANONICAL.eyeCornerL); // ~8.9 cm

let renderer, scene, camera, glassesAnchor, debugMarkers;
const fits = new Map(); // design id -> { fit: Group, modelWidth: number }
const anchorMatrix = new THREE.Matrix4();

/**
 * Creates the WebGL canvas, scene, camera and lights, and loads every
 * design's GLB so switching designs never waits on the network.
 * @param {HTMLElement} container - element the canvas is appended to (#view)
 * @param {Array<object>} designs - catalogue from glasses.js
 * @param {number} fov - initial vertical field of view in degrees
 * @returns {Promise<void>} resolves when all models are loaded
 */
export async function initRenderer3D(container, designs, fov) {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); // alpha: video shows through
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap cost on 4K/retina
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.id = 'canvas-3d';
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // near/far in cm: faces are ~30-100 cm from a webcam.
  camera = new THREE.PerspectiveCamera(fov, 16 / 9, 1, 1000);

  // Basic lighting; Phase 4 replaces this with an environment map and
  // brightness-matched lights.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(0.3, 1, 1);
  scene.add(key);

  glassesAnchor = new THREE.Group();
  glassesAnchor.matrixAutoUpdate = false; // we set .matrix directly each frame
  glassesAnchor.visible = false;
  scene.add(glassesAnchor);

  debugMarkers = createDebugMarkers();
  glassesAnchor.add(debugMarkers);

  // Keep the drawing buffer the same size as the on-screen box.
  new ResizeObserver(() => resize(container)).observe(container);
  resize(container);

  const loader = new GLTFLoader();
  await Promise.all(designs.map(async (design) => {
    const gltf = await loader.loadAsync(design.model);
    const { fit, modelWidth } = prepareModel(gltf.scene);
    fit.visible = false;
    glassesAnchor.add(fit);
    fits.set(design.id, { fit, modelWidth });
    applyFit(design);
  }));
}

/**
 * Wraps a loaded model so it can be positioned by its lens centre.
 * The model is shifted so the origin is the centre of the lenses (left-right
 * and up-down) at their front surface; offset3d then says where that point
 * goes on the face.
 * @param {THREE.Object3D} model - gltf.scene
 * @returns {{ fit: THREE.Group, modelWidth: number }}
 */
function prepareModel(model) {
  fixMaterials(model);
  model.updateMatrixWorld(true);

  const all = new THREE.Box3().setFromObject(model);
  const lenses = new THREE.Box3();
  model.traverse((o) => {
    if (o.isMesh && /glass/i.test(o.material.name)) lenses.expandByObject(o);
  });
  const ref = lenses.isEmpty() ? all : lenses; // fall back to the whole model

  const allCenter = all.getCenter(new THREE.Vector3());
  const refCenter = ref.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(allCenter.x, refCenter.y, ref.max.z));

  const fit = new THREE.Group();
  fit.add(model);
  return { fit, modelWidth: all.max.x - all.min.x };
}

/**
 * Material fixes for these Sketchfab exports (details in CLAUDE.md):
 * frames opaque and front-faces only, lenses see-through.
 * Phase 4 replaces this with full PBR materials.
 * @param {THREE.Object3D} model
 */
function fixMaterials(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (/glass/i.test(m.name)) {
      m.transparent = true;
      m.opacity = 0.35;
      m.depthWrite = false; // don't hide things behind the lens
      o.renderOrder = 1; // draw after the frame
    } else {
      m.transparent = false;
      m.opacity = 1;
      m.side = THREE.FrontSide; // inside faces of thin shells poked through
      m.roughness = Math.max(m.roughness ?? 0, 0.3); // soften mirror-like hotspots
    }
  });
}

/**
 * Small spheres at the canonical eye corners and nose bridge. In debug mode
 * they should sit on the matching green 2D landmark dots; if they drift apart
 * as you move toward the screen edges, the FOV is off.
 * @returns {THREE.Group}
 */
function createDebugMarkers() {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.3, 12, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3366, depthTest: false });
  for (const p of Object.values(CANONICAL)) {
    const s = new THREE.Mesh(geo, mat);
    s.position.copy(p);
    s.renderOrder = 2; // always on top
    group.add(s);
  }
  group.visible = false;
  return group;
}

/**
 * Applies a design's offset, rotation and scale from glasses.js to its model.
 * Called at load and whenever a tuning slider changes.
 * @param {{ id: string, scale3d: number, offset3d: object, rotation3d: object }} design
 */
export function applyFit(design) {
  const entry = fits.get(design.id);
  if (!entry) return;
  const { fit, modelWidth } = entry;
  const { offset3d: o, rotation3d: r } = design;
  fit.position.set(o.x, o.y, o.z);
  fit.rotation.set(
    THREE.MathUtils.degToRad(r.x),
    THREE.MathUtils.degToRad(r.y),
    THREE.MathUtils.degToRad(r.z),
  );
  // Model units -> cm, so the frame is scale3d x the eye-corner distance wide.
  fit.scale.setScalar((EYE_CORNER_DIST * design.scale3d) / modelWidth);
}

/**
 * Sets the camera's vertical field of view (debug slider).
 * @param {number} fov - degrees
 */
export function setFov(fov) {
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

/**
 * Matches the drawing buffer to the container's on-screen size and the camera
 * aspect to the video, so 3D and video line up.
 * @param {HTMLElement} container
 */
function resize(container) {
  const { clientWidth: w, clientHeight: h } = container;
  if (!w || !h) return;
  renderer.setSize(w, h, false); // false: leave the CSS size (100%) alone
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/**
 * Draws one frame.
 * @param {number[] | null} matrix - 16 numbers from MediaPipe, or null for no face
 * @param {string | null} designId - design to show, or null for none (2D mode)
 * @param {boolean} debug - show the canonical landmark markers
 */
export function render3D(matrix, designId, debug) {
  glassesAnchor.visible = Boolean(matrix);
  if (matrix) {
    anchorMatrix.fromArray(matrix); // reads the numbers as column-major
    // Safety net: in column-major the translation is in elements 12-14 and
    // the bottom row (3, 7, 11) is 0. If it's the other way round, the data
    // was row-major, so transpose it.
    const bottomRow = Math.abs(matrix[3]) + Math.abs(matrix[7]) + Math.abs(matrix[11]);
    const lastColumn = Math.abs(matrix[12]) + Math.abs(matrix[13]) + Math.abs(matrix[14]);
    if (bottomRow > lastColumn) anchorMatrix.transpose();
    glassesAnchor.matrix.copy(anchorMatrix);
  }
  for (const [id, { fit }] of fits) fit.visible = id === designId;
  debugMarkers.visible = debug;
  renderer.render(scene, camera);
}

/**
 * Reads the head's distance from the camera (cm) out of the current pose,
 * for the debug readout: a sanity check that the matrix is sensible.
 * @returns {number}
 */
export function headDistance() {
  return -glassesAnchor.matrix.elements[14];
}
