// ui.js — on-screen controls and overlays.
// Owns the DOM for the buttons, message box, stats panel and tuning panels;
// main.js tells it what to show and passes callbacks for user actions.
// The glasses picker shows each design's PNG as its thumbnail.

const els = {};
const sliders = new Map(); // slider key -> { input, output }
let statsWanted = true; // S toggles the stats panel (hide it for the demo video)
let running = false;

/**
 * Finds the UI elements and wires up buttons and keyboard shortcuts.
 * @param {object} handlers
 * @param {() => void} handlers.onStart
 * @param {() => void} handlers.onToggleDebug
 * @param {() => void} handlers.onNextGlasses
 * @param {() => void} handlers.onToggleMode - switch between 2D and 3D
 * @param {() => void} handlers.onTogglePin - auto-fit (eye pinning + face sizing) on/off
 * @param {(scenario: string) => void} handlers.onCapture - "Record 30 s CSV"
 * @param {(dScale: number, dBridgeY: number) => void} handlers.onTune
 *   nudges the current design's 2D fit; only called while the 2D readout shows
 */
export function initUI({ onStart, onToggleDebug, onNextGlasses, onToggleMode, onTogglePin, onCapture, onTune }) {
  els.start = document.getElementById('start-btn');
  els.picker = document.getElementById('picker');
  els.mode = document.getElementById('mode-btn');
  els.debug = document.getElementById('debug-btn');
  els.message = document.getElementById('message');
  els.stats = document.getElementById('stats');
  els.statsText = document.getElementById('stats-text');
  els.scenario = document.getElementById('scenario');
  els.capture = document.getElementById('capture-btn');
  els.tuning = document.getElementById('tuning');
  els.tune3d = document.getElementById('tune3d');

  els.start.addEventListener('click', onStart);
  els.mode.addEventListener('click', onToggleMode);
  els.debug.addEventListener('click', onToggleDebug);
  els.capture.addEventListener('click', () => onCapture(els.scenario.value.trim()));

  window.addEventListener('keydown', (e) => {
    // Typing a scenario name must not trigger the single-letter shortcuts.
    if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      statsWanted = !statsWanted;
      els.stats.hidden = !(running && statsWanted);
    } else if (key === 'd') onToggleDebug();
    else if (key === 'g') onNextGlasses();
    else if (key === 'm') onToggleMode();
    else if (key === 'p') onTogglePin();
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
    const digits = s.step < 0.01 ? 3 : 2; // readout precision follows the step
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), {
      type: 'range', min: s.min, max: s.max, step: s.step,
    });
    const output = document.createElement('output');
    label.append(s.label, input, output);
    els.tune3d.appendChild(label);

    input.addEventListener('input', () => {
      output.textContent = Number(input.value).toFixed(digits);
      onInput(s.key, Number(input.value));
    });
    // Let the D/G/M shortcuts still work after clicking a slider, and stop
    // arrow keys on a focused slider from also doing something else.
    input.addEventListener('keydown', (e) => {
      if (e.key.startsWith('Arrow')) e.stopPropagation();
    });
    sliders.set(s.key, { input, output, digits });
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
    s.output.textContent = Number(value).toFixed(s.digits);
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
  els.picker.hidden = false;
  els.mode.hidden = false;
  els.debug.hidden = false;
  running = true;
  els.stats.hidden = !statsWanted;
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
 * Builds the glasses picker: one thumbnail button per design.
 * @param {Array<{ name: string, image: string }>} designs
 * @param {(index: number) => void} onSelect
 */
export function initPicker(designs, onSelect) {
  designs.forEach((d, i) => {
    const btn = document.createElement('button');
    btn.setAttribute('role', 'radio');
    btn.title = `${d.name} (G cycles)`;
    btn.setAttribute('aria-label', d.name);
    const img = Object.assign(document.createElement('img'), { src: d.image, alt: '' });
    btn.appendChild(img);
    btn.addEventListener('click', () => onSelect(i));
    els.picker.appendChild(btn);
  });
}

/**
 * Highlights the selected design in the picker.
 * @param {number} index
 */
export function setSelectedGlasses(index) {
  [...els.picker.children].forEach((btn, i) => {
    btn.setAttribute('aria-checked', String(i === index));
  });
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
 * Updates the stats panel text (several lines).
 * @param {string} text
 */
export function setStats(text) {
  if (els.statsText.textContent !== text) els.statsText.textContent = text;
}

/**
 * Shows capture progress on the record button.
 * @param {number | null} remainingMs - null when not recording
 * @param {string} [doneLabel] - shown briefly after a capture finishes
 */
export function setCaptureState(remainingMs, doneLabel) {
  if (remainingMs !== null) {
    els.capture.disabled = true;
    els.scenario.disabled = true;
    els.capture.textContent = `Recording… ${Math.ceil(remainingMs / 1000)} s`;
  } else {
    els.capture.disabled = false;
    els.scenario.disabled = false;
    els.capture.textContent = doneLabel ?? 'Record 30 s CSV';
  }
}
