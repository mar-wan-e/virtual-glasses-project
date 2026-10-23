// metrics.js — performance measurement.
// Phase 5: rolling FPS, inference time (performance.now around detectForVideo),
// end-to-end latency (frame captureTime -> rendered frame), p50/p95, CSV export.

/**
 * Counts processed frames and reports frames per second, averaged over the
 * last second so the number on screen is stable enough to read.
 * @returns {{ tick: (now: number) => number }} call tick() once per processed
 *   frame; it returns the current FPS (0 until a full second has passed)
 */
export function createFpsCounter() {
  const times = []; // timestamps of frames within the last second
  let fps = 0;
  let windowStart = -1;
  return {
    tick(now) {
      if (windowStart < 0) windowStart = now;
      times.push(now);
      while (times[0] <= now - 1000) times.shift();
      if (now - windowStart >= 1000) fps = times.length;
      return fps;
    },
  };
}

/**
 * Creates a metrics recorder.
 * @returns {{
 *   recordFrame: (sample: { inferenceMs: number, latencyMs: number }) => void,
 *   summary: () => object,
 *   exportCSV: () => void
 * }}
 */
export function createMetrics() {
  // TODO (Phase 5): rolling buffers and percentile calculation.
  return {
    recordFrame: () => {},
    summary: () => ({}),
    exportCSV: () => {},
  };
}
