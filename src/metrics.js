// metrics.js — performance measurement.
// Phase 5: rolling FPS, inference time (performance.now around detectForVideo),
// end-to-end latency (frame captureTime -> rendered frame), p50/p95, CSV export.

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
