// renderer3d.js — Three.js scene that draws 3D glasses on the head.
// Phase 3: perspective camera matching MediaPipe's assumptions, a glassesAnchor
// driven by the facial transformation matrix, and GLB loading.
// Phase 4: depth-only head occluder, PBR materials, env map, adaptive lighting.

/**
 * Creates the WebGL renderer, scene, camera and lights over the video.
 * @param {HTMLElement} container - element the canvas is appended to
 */
export function initRenderer3D(container) {
  // TODO (Phase 3): THREE.WebGLRenderer, PerspectiveCamera, glassesAnchor.
  void container;
}

/**
 * Draws one frame with the glasses placed at the given head pose.
 * @param {object | null} pose - smoothed pose, or null to hide the glasses
 */
export function render3D(pose) {
  // TODO (Phase 3): apply pose to glassesAnchor, renderer.render(scene, camera).
  void pose;
}
