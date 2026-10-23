// renderer2d.js — fallback mode: a flat PNG of glasses drawn on a 2D canvas.
// Phase 2: outer eye corners (landmarks 33, 263) give width and roll angle,
// nose bridge (landmark 168) is the anchor point. Accounts for mirrored video.

/**
 * Creates the 2D overlay canvas.
 * @param {HTMLElement} container - element the canvas is appended to
 */
export function initRenderer2D(container) {
  // TODO (Phase 2): create canvas sized to the video.
  void container;
}

/**
 * Draws the selected glasses PNG over the face for one frame.
 * @param {Array | null} landmarks - normalised face landmarks, or null to clear
 */
export function render2D(landmarks) {
  // TODO (Phase 2): translate to landmark 168, rotate by eye-line angle, scale, drawImage.
  void landmarks;
}
