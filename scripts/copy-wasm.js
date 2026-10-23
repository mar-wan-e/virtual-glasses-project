// copy-wasm.js — copies MediaPipe's WASM runtime from node_modules into
// public/wasm so the app serves it itself (no CDN) and it always matches the
// installed @mediapipe/tasks-vision version. Runs automatically after
// `npm install` (see "postinstall" in package.json); public/wasm is gitignored.

import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'wasm');

// SIMD build for modern browsers, non-SIMD build as MediaPipe's own fallback.
const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

mkdirSync(dest, { recursive: true });
for (const file of files) {
  cpSync(join(src, file), join(dest, file));
}
console.log(`Copied MediaPipe WASM runtime to ${dest}`);
