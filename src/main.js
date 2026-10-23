// main.js — app entry point.
// Wires the modules together and owns the per-frame render loop:
//   camera frame -> tracker -> smoothing -> renderer (2D or 3D) -> metrics/UI
// Each module below is a stub in Phase 0 and gets filled in phase by phase.

import './style.css';
import { startCamera, onVideoFrame } from './camera.js';
import { initTracker, detect } from './tracker.js';
import { createPoseFilter } from './smoothing.js';
import { initRenderer3D, render3D } from './renderer3d.js';
import { initRenderer2D, render2D } from './renderer2d.js';
import { GLASSES } from './glasses.js';
import { initUI } from './ui.js';
import { createMetrics } from './metrics.js';

/**
 * Bootstraps the app: builds the UI and prepares (but does not start) the
 * pipeline. The camera only starts after a user click, because browsers
 * require a user gesture before showing the permission prompt reliably.
 */
function bootstrap() {
  initUI({ glasses: GLASSES });
  console.log('Virtual Glasses Try-On: scaffold loaded.');
}

bootstrap();

// Referenced here so the module graph is complete; used from Phase 1 onwards.
void [startCamera, onVideoFrame, initTracker, detect, createPoseFilter,
  initRenderer3D, render3D, initRenderer2D, render2D, createMetrics];
