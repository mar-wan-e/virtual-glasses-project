// ui.js — on-screen controls and overlays.
// Owns the DOM for the buttons, message box, FPS label and tuning panels;
// main.js tells it what to show and passes callbacks for user actions.
// Phase 4 replaces the "next glasses" button with a thumbnail picker.

const els = {};
const sliders = new Map(); // slider key -> { input, output }

/**
 * Finds the UI elements and wires up buttons and keyboard shortcuts.
 * @param {object} handlers
 * @param {() => void} handlers.onStart
 * @param {() => void} handlers.onToggleDebug
 * @param {() => void} handlers.onNextGlasses
 * @param {() => void} handlers.onToggleMode - switch between 2D and 3D
 * @param {(dScale: number, dBridgeY: number) => void} handlers.onTune
 *   nudges the current design's 2D fit; only called while the 2D readout shows
 */
export function initUI({ onStart, onToggleDebug, onNextGlasses, onToggleMode, onTune }) {
  els.start = document.getElementById('start-btn');
  els.glasses = document.getElementById('glasses-btn');
  els.mode = document.getElementById('mode-btn');
  els.debug = document.getElementById('debug-btn');
  els.message = document.getElementById('message');
  els.fps = document.getElementById('fps');
  els.tuning = document.getElementById('tuning');
  els.tune3d = document.getElementById('tune3d');

  els.start.addEventListener('click', onStart);
  els.glasses.addEventListener('click', onNextGlasses);
  els.mode.addEventListener('click', onToggleMode);
  els.debug.addEventListener('click', onToggleDebug);

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'd') onToggleDebug();
    else if (key === 'g') onNextGlasses();
    else if (key === 'm') onToggleMode();
    else if (!els.tuning.hidden) {
      // 2D tuning keys, active only while the 2D readout is showing:
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
 * Builds the 3D tuning panel: one slider per value plus a "copy" button.
 * @param {Array<{ key: string, label: string, min: number, max: number, step: number }>} specs
 * @param {(key: string, value: number) => void} onInput - called while dragging
 * @param {() => string} onCopy - returns the text for the "Copy values" button
 *   to put on the clipboard (also printed to the console)
 */
export function initSliders(specs, onInput, onCopy) {
  els.tune3dTitle = document.createElement('div');
  els.tune3dTitle.className = 'title';
  els.tune3d.appendChild(els.tune3dTitle);

  for (const s of specs) {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), {
      type: 'range', min: s.min, max: s.max, step: s.step,
    });
    const output = document.createElement('output');
    label.append(s.label, input, output);
    els.tune3d.appendChild(label);

    input.addEventListener('input', () => {
      output.textContent = Number(input.value).toFixed(2);
      onInput(s.key, Number(input.value));
    });
    // Let the D/G/M shortcuts still work after clicking a slider, and stop
    // arrow keys on a focused slider from also doing something else.
    input.addEventListener('keydown', (e) => {
      if (e.key.startsWith('Arrow')) e.stopPropagation();
    });
    sliders.set(s.key, { input, output });
  }

  const copy = document.createElement('button');
  const copyLabel = 'Copy values for glasses.js';
  copy.textContent = copyLabel;
  copy.addEventListener('click', async () => {
    const text = onCopy();
    console.log(text);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied! Paste into glasses.js';
    } catch {
      copy.textContent = 'Printed to console (F12)'; // clipboard blocked
    }
    setTimeout(() => { copy.textContent = copyLabel; }, 2000);
  });
  els.tune3d.appendChild(copy);
}

/**
 * Moves the sliders to show a design's current values (on design switch).
 * @param {string} title - shown above the sliders
 * @param {Record<string, number>} values - slider key -> value
 */
export function setSliderValues(title, values) {
  els.tune3dTitle.textContent = title;
  for (const [key, value] of Object.entries(values)) {
    const s = sliders.get(key);
    if (!s) continue;
    s.input.value = value;
    s.output.textContent = Number(value).toFixed(2);
  }
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
  els.mode.hidden = false;
  els.debug.hidden = false;
  els.fps.hidden = false;
}

/**
 * Updates the debug and mode buttons, and shows the tuning panel that fits
 * the mode: key-driven readout in 2D, sliders in 3D. Both only in debug.
 * @param {boolean} debug
 * @param {'2d' | '3d'} mode
 */
export function setDebugAndMode(debug, mode) {
  els.debug.textContent = `Landmarks: ${debug ? 'on' : 'off'} (D)`;
  els.mode.textContent = `Mode: ${mode.toUpperCase()} (M)`;
  els.tuning.hidden = !(debug && mode === '2d');
  els.tune3d.hidden = !(debug && mode === '3d');
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
 * @param {string} [extra] - optional debug text appended to the label
 */
export function setFps(fps, delegate, extra = '') {
  const text = `${fps} FPS · ${delegate}${extra ? ` · ${extra}` : ''}`;
  if (els.fps.textContent !== text) els.fps.textContent = text;
}
