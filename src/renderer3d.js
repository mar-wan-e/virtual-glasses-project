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
//   scene (environment = RoomEnvironment reflections)
//   ├─ lights            intensity follows the room's brightness
//   └─ glassesAnchor     matrix = smoothed facial transformation matrix
//      ├─ occluder       invisible face mesh + skull + ears: hides what's behind them
//      ├─ fit[design]    offset / rotation / scale from glasses.js
//      │  └─ gltf.scene  model, shifted so its lens centre is the origin
//      └─ debugMarkers   canonical eye corners + nose bridge (debug only)
//
// Mirroring: like the 2D overlay, this canvas sits inside #view, which CSS
// flips together with the video, so no mirroring is done in 3D.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { POSITIONS, INDICES } from './canonicalFace.js';

// Canonical face model positions (cm), from MediaPipe's canonical_face_model.obj.
const CANONICAL = {
  eyeCornerR: new THREE.Vector3(-4.445859, 2.663991, 3.173422), // landmark 33
  eyeCornerL: new THREE.Vector3(4.445859, 2.663991, 3.173422), // landmark 263
  noseBridge: new THREE.Vector3(0, 3.271027, 5.236015), // landmark 168
};
// Not drawn as debug markers, used for measuring and pinning:
const TEMPLE_R = new THREE.Vector3(-7.743095, 2.364999, -2.005167); // landmark 127
const TEMPLE_L = new THREE.Vector3(7.743095, 2.364999, -2.005167); // landmark 356
const TEMPLE_WIDTH = TEMPLE_R.distanceTo(TEMPLE_L); // ~15.5 cm
// Where the face outline meets the ear, at ear level (landmarks 234 / 454).
const EAR_ROOT_R = new THREE.Vector3(-7.664182, 0.673132, -2.435867);
const EAR_ROOT_L = new THREE.Vector3(7.664182, 0.673132, -2.435867);
// Centre of the four eye corners (33, 133, 362, 263): where the eyes are.
const EYE_CENTER = new THREE.Vector3(0, 2.624618, 3.465663);
const EYE_CORNER_IDS = [33, 133, 362, 263];

// Light intensities when the room is at "normal" brightness.
const BASE_LIGHT = { hemi: 0.8, key: 1.2, env: 1.0 };
const NORMAL_BRIGHTNESS = 0.45; // mean frame luma (0..1) treated as normal
const LIGHT_RANGE = [0.35, 1.5]; // clamp: never fully black, never blown out
const LIGHT_EVERY_N_FRAMES = 10; // brightness sampling rate
const LIGHT_LERP = 0.25; // how far to move toward the target per sample

let renderer, scene, camera, glassesAnchor, occluder, debugOccluder, debugMarkers;
let hemiLight, keyLight;
const fits = new Map(); // design id -> { fit: Group, modelWidth: number, design: object }
const anchorMatrix = new THREE.Matrix4();
let faceRatio = 1; // this user's face width / canonical face width (facefit.js)
let earShiftY = 0; // how much higher (cm) this user's ears sit than average (facefit.js)
let occluderSettings = null; // last settings passed to setOccluder

// Brightness sampling: draw the video into a tiny canvas and average it.
const sampler = document.createElement('canvas');
sampler.width = 32;
sampler.height = 18;
const samplerCtx = sampler.getContext('2d', { willReadFrequently: true });
let lightLevel = 1;
let frameCount = 0;

/**
 * Creates the WebGL canvas, scene, camera, lights, environment and occluder,
 * and loads every design's GLB so switching designs is instant.
 * @param {HTMLElement} container - element the canvas is appended to (#view)
 * @param {Array<object>} designs - catalogue from glasses.js
 * @param {{ fov: number, occluder: object }} settings - occluder: see setOccluder
 * @returns {Promise<void>} resolves when all models are loaded
 */
export async function initRenderer3D(container, designs, { fov, occluder: initialOccluder }) {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); // alpha: video shows through
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap cost on 4K/retina
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps colours true, tames highlights
  renderer.domElement.id = 'canvas-3d';
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // near/far in cm: faces are ~20-100 cm from a webcam.
  camera = new THREE.PerspectiveCamera(fov, 16 / 9, 1, 1000);

  // Reflections: a pre-blurred studio environment, so glossy frames and lenses
  // pick up believable highlights instead of looking flat.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, BASE_LIGHT.hemi);
  keyLight = new THREE.DirectionalLight(0xffffff, BASE_LIGHT.key);
  keyLight.position.set(0.3, 1, 1); // from above-front, like a ceiling light
  scene.add(hemiLight, keyLight);

  glassesAnchor = new THREE.Group();
  glassesAnchor.matrixAutoUpdate = false; // we set .matrix directly each frame
  glassesAnchor.visible = false;
  scene.add(glassesAnchor);

  ({ occluder, debugOccluder } = createOccluder());
  setOccluder(initialOccluder);
  glassesAnchor.add(occluder, debugOccluder);

  debugMarkers = createDebugMarkers();
  glassesAnchor.add(debugMarkers);

  // Keep the drawing buffer the same size as the on-screen box.
  new ResizeObserver(() => resize(container)).observe(container);
  resize(container);

  const loader = new GLTFLoader();
  await Promise.all(designs.map(async (design) => {
    const gltf = await loader.loadAsync(design.model);
    const { fit, modelWidth } = prepareModel(gltf.scene, design);
    fit.visible = false;
    glassesAnchor.add(fit);
    fits.set(design.id, { fit, modelWidth, design });
    applyFit(design);
  }));
}

/**
 * Builds the head occluder: the canonical face mesh (so the nose and cheeks
 * cover the frame behind them) plus an ellipsoid for the skull (so the far
 * temple arm disappears behind the head instead of floating over the cheek).
 *
 * It writes depth but no colour: it's invisible, yet anything drawn later
 * that is behind it fails the depth test and isn't drawn. renderOrder -1
 * makes sure it's drawn before the glasses.
 *
 * Face and skull are narrowed by the `width` setting (glasses.js OCCLUDER) so
 * the temple arms stay outside the head and the near arm stays visible.
 *
 * Ears: a flat ellipsoid on each side of the head. The ear sits outside the
 * temple arm, so from the side it covers the arm's end, which makes the arm
 * look tucked behind the ear. Ears aren't narrowed by `width`; their
 * position comes from the `ear` setting so they can be lined up with real ears.
 * @returns {{ occluder: THREE.Group, debugOccluder: THREE.Group }}
 */
function createOccluder() {
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.BufferAttribute(POSITIONS, 3));
  faceGeo.setIndex(new THREE.BufferAttribute(INDICES, 1));

  const sphereGeo = new THREE.SphereGeometry(1, 32, 16);

  // Structure: group -> head (face + skull, x-scaled by width) + 2 ears.
  const build = (material, renderOrder) => {
    const group = new THREE.Group();
    const head = new THREE.Group();
    const face = new THREE.Mesh(faceGeo, material);
    const skull = new THREE.Mesh(sphereGeo, material);
    skull.position.set(0, 1.5, -4.2); // behind the face surface
    skull.scale.set(7, 10, 8); // half-width, half-height, half-depth (cm), before `width`
    head.add(face, skull);

    const ears = [-1, 1].map((side) => {
      const ear = new THREE.Mesh(sphereGeo, material);
      ear.scale.set(EAR_SIZE.x, EAR_SIZE.y, EAR_SIZE.z);
      ear.userData.side = side; // -1 = wearer's right (canonical -x), +1 = left
      return ear;
    });

    for (const m of [face, skull, ...ears]) m.renderOrder = renderOrder;
    group.add(head, ...ears);
    group.userData = { head, ears };
    return group;
  };

  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const wire = new THREE.MeshBasicMaterial({
    color: 0x33ccff, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false,
  });
  const debugOccluder = build(wire, 3);
  debugOccluder.visible = false;
  return { occluder: build(depthOnly, -1), debugOccluder };
}

/**
 * Moves and narrows the occluder, and places the ears (debug sliders).
 * @param {{ z: number, width: number, ear: { x: number, y: number, z: number } }} settings
 *   z: cm along the face's z axis; negative pushes face + skull back
 *   width: x scale of face + skull relative to the user's measured face
 *     width (1 = their full head width)
 *   ear: centre of the left ear in cm on an average-width face (the right ear
 *     mirrors it in x); x is scaled with the user's measured face width
 */
export function setOccluder(settings, reaimArms = true) {
  occluderSettings = settings;
  const { z, width, ear } = settings;
  for (const o of [occluder, debugOccluder]) {
    const { head, ears } = o.userData;
    head.position.z = z;
    head.scale.x = width * faceRatio; // wider face -> wider invisible head
    for (const e of ears) e.position.set(e.userData.side * ear.x * faceRatio, ear.y + earShiftY, ear.z);
  }
  // The arms aim at the ears, so moving the ears moves the arms.
  if (reaimArms) for (const entry of fits.values()) aimArms(entry);
}

/**
 * Sets this user's measured face (from facefit.js) and resizes the glasses,
 * their arms, the invisible head and the ears to match.
 * @param {{ ratio: number, earOffsetY: number }} fit
 *   ratio: user's face width / canonical face width
 *   earOffsetY: how much higher (+) or lower (-) their ears sit, in cm
 */
export function setFaceFit({ ratio, earOffsetY }) {
  // Under 1% / 2 mm isn't visible: not worth re-bending the arms.
  if (Math.abs(ratio - faceRatio) < 0.01 && Math.abs(earOffsetY - earShiftY) < 0.2) return;
  faceRatio = ratio;
  earShiftY = earOffsetY;
  if (occluderSettings) setOccluder(occluderSettings, false);
  for (const { design } of fits.values()) applyFit(design); // also re-aims the arms
}

// Half-size of each invisible ear (cm): thin outward, ~6 cm tall, ~3.6 cm deep.
const EAR_SIZE = { x: 0.8, y: 3, z: 1.8 };
// Where the arm rests on the ear, relative to the ear's centre (cm): at the
// very top edge of the ear (EAR_SIZE.y up, just under it so it touches),
// slightly forward, a little inside the ear's outer edge.
const EAR_REST_INSET = 0.4;
const EAR_REST_ABOVE = EAR_SIZE.y - 0.2;
const EAR_REST_FORWARD = 0.5;
// The arm must pass outside the temple (canonical landmark 356/127), as a
// real arm does, not through the head; this is the gap it keeps (cm).
const TEMPLE_CLEARANCE = 0.25;
// Real temple arms curve down over the top of the ear and hook behind it.
// The curve is spread over TIP_BLEND cm starting TIP_LEAD cm before the ear's
// top edge, so you see the arm bend as it goes over the ear; the part that
// continues down behind the ear (TIP_LENGTH cm, times armLength) is hidden
// by the invisible ear, like a real ear hides it.
const TIP_LENGTH = 3;
const TIP_DROOP_DEG = 55;
const TIP_LEAD = 0.8;
const TIP_BLEND = 1.6;
// A model has its own hook if its arm drops this far (cm) below its straight
// line near the end. All three current models do.
const HOOK_DROP = 0.4;
// How far (cm) the hook tucks inward toward the head by its end, so the tip
// ends inside the invisible head instead of poking out behind the ear.
const HOOK_TUCK = 1.2;
// Distance (cm) behind the lenses where the arm starts (the hinge), and how
// far behind the hinge the bend blends in, so there's no kink at the hinge.
const HINGE_GAP = 0.3;
const BEND_BLEND = 1.0;
const DOWN = new THREE.Vector3(0, -1, 0);

const _m = new THREE.Matrix4();
const _mInv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _nmInv = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _a = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Matrix from a mesh's own space to the glasses anchor's space (the face),
 * i.e. every transform from the mesh up to and including the fit group,
 * without the head pose.
 * @param {THREE.Object3D} mesh
 * @param {THREE.Object3D} fit
 * @param {THREE.Matrix4} out
 * @returns {THREE.Matrix4}
 */
function meshToFace(mesh, fit, out) {
  const chain = [];
  for (let o = mesh; o; o = o.parent) {
    o.updateMatrix();
    chain.push(o.matrix);
    if (o === fit) break;
  }
  out.identity();
  for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i]);
  return out;
}

/**
 * Bends each temple arm at its hinge so it runs to this user's ear.
 *
 * The models' arms are rigid and point wherever the 3D artist left them, so on
 * a real face they miss the ears. Each model is different (arm length, where
 * its own hook starts, how steep it is), so everything is measured from the
 * model, per side, in face space (cm):
 *   - the hinge: where the arm leaves the frame, just behind the lenses;
 *   - the straight part's direction (hinge to the middle of the arm);
 *   - where the model's own hook starts (the arm drops below that line).
 * Then every vertex behind the hinge is rotated about the hinge so the
 * straight part points at the top of the user's ear, and the straight part
 * is stretched so the model's hook starts exactly there and curves down
 * behind the ear (hidden by the invisible ear). Models without a hook get
 * one added. The bend fades in over the first centimetre so there's no kink.
 * Runs when the fit, face width or ear position changes, not every frame:
 * the ears don't move relative to the head.
 * @param {{ fit: THREE.Group, design: object }} entry
 */
function aimArms({ fit, design }) {
  if (!occluderSettings || !fit.parent) return;
  const meshes = [];
  fit.traverse((o) => { if (o.isMesh) meshes.push(o); });

  // Hinge depth: just behind the back of the lenses.
  let lensBack = Infinity;
  for (const mesh of meshes) {
    if (!mesh.userData.isLens) continue;
    meshToFace(mesh, fit, _m);
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) lensBack = Math.min(lensBack, _v.fromBufferAttribute(pos, i).applyMatrix4(_m).z);
  }
  if (!Number.isFinite(lensBack)) return;
  const hingeZ = lensBack - HINGE_GAP;

  // Pass 1: find frame width, and per side the hinge point and tip.
  const frames = meshes.filter((m) => !m.userData.isLens && m.userData.origPos);
  let halfW = 0;
  for (const mesh of frames) {
    meshToFace(mesh, fit, _m);
    const p = mesh.userData.origPos;
    for (let i = 0; i < p.length; i += 3) halfW = Math.max(halfW, Math.abs(_v.fromArray(p, i).applyMatrix4(_m).x));
  }
  const isArm = (v, side) => side * v.x > 0.5 * halfW && v.z < hingeZ; // excludes nose pads
  const armPoints = { [-1]: [], [1]: [] };
  for (const mesh of frames) {
    meshToFace(mesh, fit, _m);
    const p = mesh.userData.origPos;
    for (let i = 0; i < p.length; i += 3) {
      _v.fromArray(p, i).applyMatrix4(_m);
      const side = Math.sign(_v.x);
      if (side && isArm(_v, side)) armPoints[side].push(_v.clone());
    }
  }
  const mean = (pts) => pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(pts.length);

  const sides = [-1, 1].map((side) => {
    const pts = armPoints[side];
    if (pts.length < 10) return null;
    const depth = hingeZ - Math.min(...pts.map((p) => p.z)); // how far back the arm goes
    const nearHinge = pts.filter((p) => p.z > hingeZ - 1);
    const middle = pts.filter((p) => p.z < hingeZ - 0.4 * depth && p.z > hingeZ - 0.6 * depth);
    if (!nearHinge.length || !middle.length) return null;
    const hinge = mean(nearHinge);
    // Direction of the straight part of the arm. Measured to the arm's middle,
    // not its tip: most models already curve down at the end, and aiming
    // "hinge to tip" at the ear would tilt the straight part upward.
    const dir = mean(middle).sub(hinge).normalize();

    // Where the model's own hook starts: walk back along the arm in 0.5 cm
    // steps and find where the arm drops HOOK_DROP below its straight line.
    const along = (p) => _u.copy(p).sub(hinge).dot(dir);
    const drop = (p) => _u.copy(p).sub(hinge).addScaledVector(dir, -along(p)).y; // height off the line
    const baseline = middle.reduce((s, p) => s + drop(p), 0) / middle.length;
    const maxAlong = Math.max(...pts.map(along));
    let hookAt = maxAlong;
    for (let a = 0.6 * maxAlong; a < maxAlong; a += 0.5) {
      const slice = pts.filter((p) => { const t = along(p); return t >= a && t < a + 0.5; });
      if (slice.length && slice.reduce((s, p) => s + drop(p), 0) / slice.length < baseline - HOOK_DROP) {
        hookAt = a;
        break;
      }
    }
    const hasHook = hookAt < maxAlong - 1;

    // Rest point on top of this user's ear (same maths as setOccluder's ears).
    const { ear, width, z: occZ } = occluderSettings;
    const rest = new THREE.Vector3(
      ear.x * faceRatio - EAR_REST_INSET, // |x|; the side's sign is applied below
      ear.y + earShiftY + EAR_REST_ABOVE,
      ear.z + EAR_REST_FORWARD,
    );
    // Make the straight arm clear the temple: if a line from the hinge to the
    // rest point would pass inside the head at the temple's depth, move the
    // rest point outward until it doesn't.
    const templeX = TEMPLE_L.x * width * faceRatio + TEMPLE_CLEARANCE;
    const templeZ = TEMPLE_L.z + occZ;
    const hingeX = Math.abs(hinge.x);
    if (hinge.z > templeZ && templeZ > rest.z) {
      const needed = hingeX + ((templeX - hingeX) * (hinge.z - rest.z)) / (hinge.z - templeZ);
      rest.x = Math.max(rest.x, needed);
    }
    rest.x *= side;

    const to = rest.clone().sub(hinge);
    const restDist = to.length() * design.armLength; // where the hook should start
    const newDir = to.clone().normalize();

    // How each point's distance along the arm changes. With a built-in hook:
    // stretch only the straight part so the hook starts at the top of the ear,
    // and move the hook along unchanged (keeps the model's own shape). Without
    // one: stretch the whole arm to reach past the ear; we add a hook below.
    // The hook starts TIP_LEAD before the ear's top edge, so you can see it
    // bend as it goes over the ear before the ear hides the rest.
    const k = hasHook ? Math.max(0.1, restDist - TIP_LEAD) / hookAt : (restDist + TIP_LENGTH) / maxAlong;
    const mapAlong = hasHook
      ? (a) => (a <= hookAt ? a * k : a + hookAt * (k - 1))
      : (a) => a * k;

    // Where the hook starts and ends along the new arm, for the inward tuck.
    const hookStart = Math.max(0, restDist - TIP_LEAD);
    const hookEnd = Math.max(hookStart + 0.5, hasHook ? mapAlong(maxAlong) : restDist + TIP_LENGTH);

    return {
      side,
      hinge,
      dir,
      mapAlong,
      hasHook,
      restDist,
      hookStart,
      hookEnd,
      rotation: new THREE.Quaternion().setFromUnitVectors(dir, newDir),
      // Added hook (models without one): the curve over the ear pivots where
      // it starts (TIP_LEAD before the rest point), so nothing in front of it
      // moves; points after it swing down about a horizontal axis.
      bendAt: hinge.clone().addScaledVector(newDir, Math.max(0, restDist - TIP_LEAD)),
      droop: new THREE.Quaternion().setFromAxisAngle(
        newDir.clone().cross(DOWN).normalize(),
        THREE.MathUtils.degToRad(TIP_DROOP_DEG),
      ),
    };
  });

  // Pass 2: rewrite the frame vertices (arms bent, everything else original).
  for (const mesh of frames) {
    meshToFace(mesh, fit, _m);
    _mInv.copy(_m).invert();
    _nm.getNormalMatrix(_m);
    _nmInv.getNormalMatrix(_mInv);
    const { origPos, origNor } = mesh.userData;
    const pos = mesh.geometry.attributes.position;
    const nor = mesh.geometry.attributes.normal;
    for (let i = 0, j = 0; i < pos.count; i++, j += 3) {
      _v.fromArray(origPos, j).applyMatrix4(_m);
      const side = _v.x < 0 ? sides[0] : sides[1];
      const w = side && isArm(_v, Math.sign(_v.x))
        ? THREE.MathUtils.clamp((hingeZ - _v.z) / BEND_BLEND, 0, 1)
        : 0;
      if (w === 0) {
        pos.setXYZ(i, origPos[j], origPos[j + 1], origPos[j + 2]);
        if (nor && origNor) nor.setXYZ(i, origNor[j], origNor[j + 1], origNor[j + 2]);
        continue;
      }
      // 1. Stretch along the arm's own direction only (keeps its thickness),
      //    then rotate about the hinge toward the ear.
      _u.copy(_v).sub(side.hinge);
      const a0 = _u.dot(side.dir); // distance along the original arm
      const along = side.mapAlong(a0); // ... and along the new one
      _u.addScaledVector(side.dir, along - a0).applyQuaternion(side.rotation).add(side.hinge);
      // 2. Models without their own hook: curve the tip down over the ear.
      const droop = side.hasHook
        ? 0
        : THREE.MathUtils.smoothstep(along, side.restDist - TIP_LEAD, side.restDist - TIP_LEAD + TIP_BLEND);
      if (droop > 0) {
        _a.copy(_u).sub(side.bendAt).applyQuaternion(side.droop).add(side.bendAt);
        _u.lerp(_a, droop);
      }
      // 3. Along the hook, tuck the arm inward toward the head (as real temple
      //    tips wrap behind the ear), so its end goes inside the invisible
      //    head and can't poke out behind the ear, however long the hook is.
      const tuck = THREE.MathUtils.smoothstep(along, side.hookStart, side.hookEnd);
      if (tuck > 0) _u.x -= side.side * HOOK_TUCK * tuck;
      // 4. Blend by w near the hinge, so the frame front isn't kinked.
      _v.lerp(_u, w).applyMatrix4(_mInv);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
      if (nor && origNor) {
        _n.fromArray(origNor, j).applyMatrix3(_nm).applyQuaternion(side.rotation);
        if (droop > 0.5) _n.applyQuaternion(side.droop);
        _n.applyMatrix3(_nmInv).normalize();
        nor.setXYZ(i, _n.x, _n.y, _n.z);
      }
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
  }
}

/**
 * Wraps a loaded model so it can be positioned by its lens centre, and gives
 * it realistic materials. The model is shifted so the origin is the centre of
 * the lenses (left-right and up-down) at their front surface; offset3d then
 * says where that point goes on the face.
 * @param {THREE.Object3D} model - gltf.scene
 * @param {{ lensColor: string, lensOpacity: number }} design
 * @returns {{ fit: THREE.Group, modelWidth: number }}
 */
function prepareModel(model, design) {
  applyMaterials(model, design);
  model.updateMatrixWorld(true);

  const all = new THREE.Box3().setFromObject(model);
  const lenses = new THREE.Box3();
  model.traverse((o) => {
    if (o.isMesh && o.userData.isLens) lenses.expandByObject(o);
  });
  const ref = lenses.isEmpty() ? all : lenses; // fall back to the whole model

  const allCenter = all.getCenter(new THREE.Vector3());
  const refCenter = ref.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(allCenter.x, refCenter.y, ref.max.z));

  // Keep each frame mesh's original vertices, so aimArms() can re-bend the
  // arms from scratch whenever the face changes. Geometry is cloned so no
  // other mesh shares (and gets bent by) the same vertex buffer.
  model.traverse((o) => {
    if (!o.isMesh || o.userData.isLens) return;
    o.geometry = o.geometry.clone();
    o.userData.origPos = o.geometry.attributes.position.array.slice();
    o.userData.origNor = o.geometry.attributes.normal?.array.slice();
  });

  const fit = new THREE.Group();
  fit.add(model);
  return { fit, modelWidth: all.max.x - all.min.x };
}

/**
 * Replaces the models' materials with physically based ones.
 * Frames: MeshPhysicalMaterial keeping the model's colour; plastic gets a thin
 * clear coat (the glossy layer on acetate frames), metal parts are metallic.
 * Lenses (material name contains "glass"): thin tinted glass, mostly
 * see-through so the eyes show. Opacity is used rather than physical
 * transmission, because transmission can only refract what's in the 3D scene,
 * and our background (the video) isn't in it.
 * Also fixes Sketchfab quirks: double-sided thin shells and near-mirror
 * roughness (see CLAUDE.md).
 * @param {THREE.Object3D} model
 * @param {{ lensColor: string, lensOpacity: number }} design
 */
function applyMaterials(model, design) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    if (/glass/i.test(old.name)) {
      o.userData.isLens = true;
      o.material = new THREE.MeshPhysicalMaterial({
        color: design.lensColor,
        metalness: 0,
        roughness: 0.05, // polished: sharp reflections
        transparent: true,
        opacity: design.lensOpacity,
        depthWrite: false, // don't hide things behind the lens
        side: THREE.DoubleSide, // some lenses are single planes
      });
      o.renderOrder = 1; // after the frame
    } else {
      const isMetal = /metal/i.test(old.name);
      o.material = new THREE.MeshPhysicalMaterial({
        color: old.color,
        metalness: isMetal ? 1 : 0,
        roughness: isMetal ? 0.25 : 0.35,
        clearcoat: isMetal ? 0 : 0.5,
        clearcoatRoughness: 0.3,
        side: THREE.FrontSide, // inside faces of thin shells poked through
      });
    }
    old.dispose();
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
    s.renderOrder = 4; // always on top
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
  // Model units -> cm, so the frame is scale3d x this user's temple-to-temple
  // face width: the same scale3d fits narrow and wide faces alike.
  fit.scale.setScalar((TEMPLE_WIDTH * faceRatio * design.scale3d) / modelWidth);
  // The arms are bent to reach this user's ears (armLength fine-tunes how far
  // past the ear they go).
  aimArms(entry);
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/**
 * Projects a canonical-face point (cm) through the pose and camera to screen
 * coordinates in the same units as MediaPipe landmarks (0..1, y down), but
 * with x stretched by the aspect ratio so x and y distances are comparable.
 * @param {THREE.Vector3} point - canonical position
 * @param {THREE.Matrix4} m - pose
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3} out, with x/y set
 */
function toScreen(point, m, out) {
  out.copy(point).applyMatrix4(m).project(camera); // -> normalised device coords (-1..1)
  out.set(((out.x + 1) / 2) * camera.aspect, (1 - out.y) / 2, 0);
  return out;
}

/**
 * A landmark in the same screen units as toScreen().
 * @param {{x: number, y: number}} lm - normalised landmark
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3}
 */
function landmarkToScreen(lm, out) {
  return out.set(lm.x * camera.aspect, lm.y, 0);
}

/**
 * Measures this frame's face for facefit.js:
 *   - the user's real temple-to-temple width on screen, and the canonical
 *     face's width under the same pose (their ratio = face width);
 *   - ear height: where the face meets the ear (landmarks 234/454, at ear
 *     level) compared with where the canonical face puts them, in cm. There
 *     are no ear landmarks, but this is where the ear attaches, so it says
 *     whether this person's ears sit higher or lower than average;
 *   - how far the face is turned away from the camera.
 * @param {number[]} matrix - 16 numbers, column-major
 * @param {Array<{x: number, y: number}>} landmarks
 * @returns {{ measuredWidth: number, expectedWidth: number, earOffsetY: number, facingAngleDeg: number }}
 */
export function measureFace(matrix, landmarks) {
  const m = anchorMatrix.fromArray(matrix);
  const measuredWidth = landmarkToScreen(landmarks[127], tmp)
    .distanceTo(landmarkToScreen(landmarks[356], tmp2));
  const expectedWidth = toScreen(TEMPLE_R, m, tmp).distanceTo(toScreen(TEMPLE_L, m, tmp2));

  // Screen units per cm at the temples' depth, to turn a screen offset into cm.
  const perCm = expectedWidth / TEMPLE_WIDTH;
  let earOffsetY = 0;
  for (const [id, point] of [[234, EAR_ROOT_R], [454, EAR_ROOT_L]]) {
    const dy = landmarkToScreen(landmarks[id], tmp).y - toScreen(point, m, tmp2).y;
    earOffsetY += -dy / perCm / 2; // screen y points down, face y up; average both sides
  }

  // The face's forward (+z) axis in camera space; facing the camera = (0,0,1).
  const forward = tmp.set(m.elements[8], m.elements[9], m.elements[10]).normalize();
  const facingAngleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(forward.z, -1, 1)));
  return { measuredWidth, expectedWidth, earOffsetY, facingAngleDeg };
}

/**
 * Centre of the user's four eye corners (33, 133, 362, 263), normalised
 * 0..1 with y down. Eye corners don't move when the eyes look around.
 * @param {Array<{x: number, y: number}>} landmarks
 * @returns {{x: number, y: number}}
 */
export function eyeCentre(landmarks) {
  let x = 0;
  let y = 0;
  for (const id of EYE_CORNER_IDS) {
    x += landmarks[id].x / EYE_CORNER_IDS.length;
    y += landmarks[id].y / EYE_CORNER_IDS.length;
  }
  return { x, y };
}

/**
 * Pins the head pose to the user's eyes.
 *
 * MediaPipe's matrix comes from fitting an average face to the whole face
 * (mouth and jaw included), so for a real face it sits slightly off, and it
 * shifts when you talk or smile; the glasses then slide relative to the eyes.
 * The eye corners are tracked directly, stay put when you talk, and don't
 * move when you look around (unlike the pupils). So: keep the matrix's
 * rotation and distance, but shift it sideways/up-down (at the same depth)
 * until the canonical eye centre lands exactly on the centre of the user's
 * four eye corners. The lenses then sit where this person's eyes really are.
 *
 * This runs AFTER smoothing: rotation and distance come from the smoothed
 * pose, but the position is locked to the eye centre of the current frame,
 * so the glasses never trail behind the face.
 *
 * Works in raw camera coordinates (no mirroring), like the rest of the scene.
 * @param {number[]} matrix - 16 numbers, column-major
 * @param {{x: number, y: number}} eyes - eye centre from eyeCentre(), 0..1, y down
 * @returns {number[]} corrected matrix
 */
export function pinToEyes(matrix, eyes) {
  const m = anchorMatrix.fromArray(matrix);
  const p = tmp.copy(EYE_CENTER).applyMatrix4(m); // where the pose puts it (camera space)
  const depth = -p.z; // distance in front of the camera
  if (depth <= 0) return matrix;

  // Size of the visible area at that depth, from the camera's field of view.
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * depth;
  const halfW = halfH * camera.aspect;
  // Landmark (0..1, y down) -> camera-space x/y at that depth (y up).
  const targetX = (eyes.x * 2 - 1) * halfW;
  const targetY = -(eyes.y * 2 - 1) * halfH;

  const out = matrix.slice();
  out[12] += targetX - p.x; // translation lives in elements 12-14
  out[13] += targetY - p.y;
  return out;
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
 * Adapts the lights to the room. Every LIGHT_EVERY_N_FRAMES frames, shrink the
 * video to 32x18, average its brightness, and ease the light intensities
 * toward a matching level: dim room -> dimmer glasses, bright room -> brighter.
 * Easing (lerp) avoids flicker when the camera's auto-exposure adjusts.
 * @param {HTMLVideoElement} video
 */
export function updateLighting(video) {
  if (frameCount++ % LIGHT_EVERY_N_FRAMES !== 0) return;
  samplerCtx.drawImage(video, 0, 0, sampler.width, sampler.height);
  const { data } = samplerCtx.getImageData(0, 0, sampler.width, sampler.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Perceived brightness (Rec. 709 luma weights).
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const brightness = sum / (data.length / 4) / 255;
  const target = THREE.MathUtils.clamp(brightness / NORMAL_BRIGHTNESS, ...LIGHT_RANGE);
  lightLevel += (target - lightLevel) * LIGHT_LERP;

  hemiLight.intensity = BASE_LIGHT.hemi * lightLevel;
  keyLight.intensity = BASE_LIGHT.key * lightLevel;
  scene.environmentIntensity = BASE_LIGHT.env * lightLevel;
}

/**
 * Current light level (1 = normal room), for the debug readout.
 * @returns {number}
 */
export function getLightLevel() {
  return lightLevel;
}

/**
 * Draws one frame.
 * @param {number[] | null} matrix - smoothed pose (16 numbers, column-major),
 *   or null when there's no face
 * @param {string | null} designId - design to show, or null for none (2D mode)
 * @param {boolean} debug - show the canonical markers and occluder wireframe
 */
export function render3D(matrix, designId, debug) {
  glassesAnchor.visible = Boolean(matrix && designId);
  if (matrix) glassesAnchor.matrix.copy(anchorMatrix.fromArray(matrix));
  for (const [id, { fit }] of fits) fit.visible = id === designId;
  debugMarkers.visible = debug;
  debugOccluder.visible = debug;
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
