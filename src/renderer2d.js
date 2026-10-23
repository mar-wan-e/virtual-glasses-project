// renderer2d.js — fallback mode: a flat PNG of glasses drawn on a 2D canvas.
//
// Placement uses three landmarks per frame:
//   33  = outer corner of the right eye  ┐ distance -> glasses width
//   263 = outer corner of the left eye   ┘ angle    -> head roll (tilt)
//   168 = nose bridge between the eyes   -> anchor point
//
// Mirroring: this canvas sits inside #view, which CSS flips together with the
// video. So we draw in raw (un-mirrored) camera coordinates and the browser
// mirrors glasses and face together. No coordinate flipping needed here.

// Named by image side: the subject's right eye appears on the left of the raw
// (un-mirrored) camera image.
const IMG_LEFT_EYE_CORNER = 33;
const IMG_RIGHT_EYE_CORNER = 263;
const NOSE_BRIDGE = 168;

let canvas = null;
let ctx = null;
const images = new Map(); // design id -> loaded HTMLImageElement

/**
 * Creates the 2D overlay canvas and preloads every design's PNG, so switching
 * designs later never waits on the network.
 * @param {HTMLElement} container - element the canvas is appended to (#view)
 * @param {Array<{id: string, image: string}>} designs - catalogue from glasses.js
 * @returns {Promise<void>} resolves when all PNGs have loaded
 */
export async function initRenderer2D(container, designs) {
  canvas = document.createElement('canvas');
  canvas.id = 'canvas-2d';
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  await Promise.all(designs.map(async (d) => {
    const img = new Image();
    img.src = d.image;
    await img.decode(); // waits for download + decode; throws if the file is missing
    images.set(d.id, img);
  }));
}

/**
 * Matches the canvas resolution to the camera so 1 canvas pixel = 1 video pixel.
 * @param {number} width
 * @param {number} height
 */
export function resizeRenderer2D(width, height) {
  canvas.width = width;
  canvas.height = height;
}

/**
 * Draws the design's PNG over the face for one frame, or just clears the
 * canvas when `landmarks` is null (no face) or `design` is null (2D mode off).
 * @param {Array<{x:number,y:number}> | null} landmarks - normalised (0..1)
 * @param {{ id: string, scale2d: number, bridgeY2d: number } | null} design
 */
export function render2D(landmarks, design) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks || !design) return;
  const img = images.get(design.id);
  if (!img) return;

  // Landmarks are normalised; convert to canvas pixels.
  const px = (i) => ({ x: landmarks[i].x * canvas.width, y: landmarks[i].y * canvas.height });
  const a = px(IMG_LEFT_EYE_CORNER);
  const b = px(IMG_RIGHT_EYE_CORNER);
  const bridge = px(NOSE_BRIDGE);

  // Eye-corner distance sets the size: closer to the camera = bigger.
  const eyeDist = Math.hypot(b.x - a.x, b.y - a.y);
  // Angle of the line between the eye corners = how much the head is tilted.
  const roll = Math.atan2(b.y - a.y, b.x - a.x);

  const w = eyeDist * design.scale2d;
  const h = w * (img.naturalHeight / img.naturalWidth); // keep PNG proportions

  // Move the origin to the nose bridge, rotate with the head, then draw the
  // PNG centred horizontally with its bridge point (bridgeY2d) on the origin.
  ctx.save();
  ctx.translate(bridge.x, bridge.y);
  ctx.rotate(roll);
  ctx.drawImage(img, -w / 2, -h * design.bridgeY2d, w, h);
  ctx.restore();
}
