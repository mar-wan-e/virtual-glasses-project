// ui.js — on-screen controls and overlays.
// Owns the DOM for the buttons, message box, FPS label and tuning readout;
// main.js tells it what to show and passes callbacks for user actions.
// Phase 4 replaces the "next glasses" button with a thumbnail picker.

const els = {};

/**
 * Finds the UI elements and wires up buttons and keyboard shortcuts.
 * @param {object} handlers
 * @param {() => void} handlers.onStart
 * @param {() => void} handlers.onToggleDebug
 * @param {() => void} handlers.onNextGlasses
 * @param {(dScale: number, dBridgeY: number) => void} handlers.onTune
 *   nudges the current design's 2D fit; only called while debug is on
 */
export function initUI({ onStart, onToggleDebug, onNextGlasses, onTune }) {
  els.start = document.getElementById('start-btn');
  els.glasses = document.getElementById('glasses-btn');
  els.debug = document.getElementById('debug-btn');
  els.message = document.getElementById('message');
  els.fps = document.getElementById('fps');
  els.tuning = document.getElementById('tuning');

  els.start.addEventListener('click', onStart);
  els.glasses.addEventListener('click', onNextGlasses);
  els.debug.addEventListener('click', onToggleDebug);

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'd') onToggleDebug();
    else if (key === 'g') onNextGlasses();
    else if (!els.tuning.hidden) {
      // Tuning keys, active only in debug mode:
      //   +/-        glasses bigger / smaller
      //   up/down    glasses higher / lower on the face
      if (key === '=' || key === '+') onTune(0.02, 0);
      else if (key === '-') onTune(-0.02, 0);
      else if (key === 'arrowup') onTune(0, 0.01);
      else if (key === 'arrowdown') onTune(0, -0.01);
      else return;
      e.preventDefault(); // stop arrow keys scrolling the page
    }
  });
}

/**
 * Shows a message over the video, or hides it when `text` is empty.
 * Skips DOM writes when the text hasn't changed, since this runs every frame.
 * @param {string} text
 */
export function showMessage(text) {
  if (els.message.textContent === text && els.message.hidden === !text) return;
  els.message.textContent = text;
  els.message.hidden = !text;
}

/**
 * Enables or disables the start button (disabled while the camera is starting).
 * @param {boolean} enabled
 */
export function setStartEnabled(enabled) {
  els.start.disabled = !enabled;
}

/** Switches the controls from "not started" to "running". */
export function setRunning() {
  els.start.hidden = true;
  els.glasses.hidden = false;
  els.debug.hidden = false;
  els.fps.hidden = false;
}

/**
 * Updates the debug toggle's label and shows/hides the tuning readout.
 * @param {boolean} on
 */
export function setDebug(on) {
  els.debug.textContent = `Landmarks: ${on ? 'on' : 'off'} (D)`;
  els.tuning.hidden = !on;
}

/**
 * Shows the current design's name on the glasses button.
 * @param {string} name
 */
export function setGlassesLabel(name) {
  els.glasses.textContent = `${name} (G)`;
}

/**
 * Shows the current design's 2D fit values, ready to copy into glasses.js.
 * @param {{ id: string, scale2d: number, bridgeY2d: number }} design
 */
export function setTuning(design) {
  els.tuning.textContent =
    `${design.id}\n` +
    `scale2d:   ${design.scale2d.toFixed(2)}  (+/-)\n` +
    `bridgeY2d: ${design.bridgeY2d.toFixed(2)}  (up/down)`;
}

/**
 * Updates the FPS label in the corner.
 * @param {number} fps
 * @param {string} delegate - 'GPU' or 'CPU', shown so slow runs are easy to explain
 */
export function setFps(fps, delegate) {
  const text = `${fps} FPS · ${delegate}`;
  if (els.fps.textContent !== text) els.fps.textContent = text;
}
