// metrics.js — performance measurement.
//
// Per processed camera frame we record:
//   - inference ms: time spent in MediaPipe's detectForVideo (timed in main.js);
//   - frame work ms: all of our work for the frame (draw video, detect,
//     smooth, render glasses); if this is far below the camera's frame
//     interval, a low FPS comes from the camera, not the app;
//   - end-to-end latency ms: from when the camera captured the frame
//     (requestVideoFrameCallback's captureTime) to when the frame we drew for
//     it is on screen.
// FPS is processed frames per second. The stats panel shows p50 (typical) and
// p95 (worst 5%) over the last few seconds; a 30 s capture saves every frame
// to a CSV for the README's results table.
//
// "On screen": browsers don't report when a frame is actually displayed.
// Our drawing (made inside the video-frame callback) is shown at the end of
// the current display frame, i.e. around the start of the next one. Two
// nested requestAnimationFrame calls give exactly that time: the first fires
// in the current frame, the second at the start of the next. This is the
// standard way to estimate presentation time in a web page; it can be off by
// up to one display refresh (~16 ms at 60 Hz), and it does not include the
// monitor's own delay.
//
// Everything uses the performance.now() clock, which captureTime and the
// requestAnimationFrame timestamps share.

// The stats panel summarises this much recent history.
const WINDOW_MS = 3000;
// Default capture length for the CSV export.
export const CAPTURE_MS = 30000;

/**
 * Nearest-rank percentile.
 * @param {number[]} values
 * @param {number} p - 0..100
 * @returns {number} NaN if there are no values
 */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/**
 * Summarises a list of frame samples.
 * @param {Array<{ time: number, inferenceMs: number, frameMs: number, latencyMs: number | null }>} samples
 * @param {number} spanMs - time the samples cover, for FPS
 * @returns {{ fps: number, inferenceP50: number, inferenceP95: number, frameP50: number, frameP95: number, latencyP50: number, latencyP95: number, frames: number }}
 */
function summarise(samples, spanMs) {
  const inference = samples.map((s) => s.inferenceMs);
  const frameWork = samples.map((s) => s.frameMs);
  const latency = samples.map((s) => s.latencyMs).filter((v) => v !== null);
  return {
    fps: spanMs > 0 ? ((samples.length - 1) * 1000) / spanMs : 0, // N frames = N-1 gaps
    inferenceP50: percentile(inference, 50),
    inferenceP95: percentile(inference, 95),
    frameP50: percentile(frameWork, 50),
    frameP95: percentile(frameWork, 95),
    latencyP50: percentile(latency, 50),
    latencyP95: percentile(latency, 95),
    frames: samples.length,
  };
}

/**
 * Creates the metrics recorder.
 * @returns {{
 *   frame: (f: { inferenceMs: number, frameMs: number, captureTime: number, hasCaptureTime: boolean, face: boolean }) => void,
 *   summary: () => ReturnType<typeof summarise>,
 *   startCapture: (meta: Record<string, string>, durationMs?: number) => Promise<object>,
 *   capturing: () => number | null,
 * }}
 */
export function createMetrics() {
  const recent = []; // samples within WINDOW_MS, for the stats panel
  let capture = null; // { start, durationMs, samples, meta, resolve }

  /**
   * Records one processed frame. Call right after the frame's glasses are
   * drawn. Latency is filled in a moment later, when the frame is on screen.
   */
  function frame({ inferenceMs, frameMs, captureTime, hasCaptureTime, face }) {
    const time = performance.now();
    const sample = { time, inferenceMs, frameMs, latencyMs: null, hasCaptureTime, face };
    recent.push(sample);
    while (recent.length && recent[0].time < time - WINDOW_MS) recent.shift();

    requestAnimationFrame(() => {
      requestAnimationFrame((shownAt) => {
        sample.latencyMs = shownAt - captureTime;
      });
    });

    if (capture) {
      capture.samples.push(sample);
      if (time - capture.start >= capture.durationMs) finishCapture();
    }
  }

  /** Summary of the last WINDOW_MS, for the stats panel. */
  function summary() {
    if (recent.length < 2) return summarise(recent, 0);
    return summarise(recent, recent[recent.length - 1].time - recent[0].time);
  }

  /**
   * Starts recording every frame for `durationMs`, then downloads a CSV.
   * @param {Record<string, string>} meta - test conditions written at the top
   * @param {number} [durationMs]
   * @returns {Promise<object>} resolves with the capture's summary
   */
  function startCapture(meta, durationMs = CAPTURE_MS) {
    if (capture) return capture.promise;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    capture = { start: performance.now(), durationMs, samples: [], meta, resolve, promise };
    return promise;
  }

  function finishCapture() {
    const done = capture;
    capture = null;
    // Give the last frames' latency measurements time to arrive.
    setTimeout(() => {
      const { samples, meta, start } = done;
      const span = samples.length > 1 ? samples[samples.length - 1].time - samples[0].time : 0;
      const result = summarise(samples, span);
      downloadCsv(toCsv(samples, start, meta, result), meta.scenario);
      done.resolve(result);
    }, 100);
  }

  /** Remaining capture time in ms, or null if not capturing. */
  function capturing() {
    if (!capture) return null;
    return Math.max(0, capture.durationMs - (performance.now() - capture.start));
  }

  return { frame, summary, startCapture, capturing };
}

/**
 * Builds the CSV text: '#' lines with the test conditions and summary, then
 * one row per frame.
 * @returns {string}
 */
function toCsv(samples, start, meta, result) {
  const f = (n) => (Number.isFinite(n) ? n.toFixed(2) : '');
  const lines = [
    ...Object.entries(meta).map(([k, v]) => `# ${k}: ${String(v).replace(/[\r\n]/g, ' ')}`),
    `# frames: ${result.frames}`,
    `# fps_avg: ${f(result.fps)}`,
    `# inference_ms_p50: ${f(result.inferenceP50)}, p95: ${f(result.inferenceP95)}`,
    `# frame_work_ms_p50: ${f(result.frameP50)}, p95: ${f(result.frameP95)}`,
    `# latency_ms_p50: ${f(result.latencyP50)}, p95: ${f(result.latencyP95)}`,
    'time_ms,inference_ms,frame_work_ms,latency_ms,face_detected,capture_time_from_browser',
    ...samples.map((s) => [
      f(s.time - start), f(s.inferenceMs), f(s.frameMs), f(s.latencyMs ?? NaN), s.face ? 1 : 0, s.hasCaptureTime ? 1 : 0,
    ].join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Saves text as a .csv file via a temporary download link.
 * @param {string} text
 * @param {string} [label] - scenario name, used in the file name
 */
function downloadCsv(text, label = 'capture') {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const safe = label.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'capture';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `metrics-${safe}-${stamp}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
