// Shared ^FR (Reverse Print) overlay helper
//
// Implements ZPL's "no print where fields overlap" semantics on canvas.
// The overlap-flip is computed against the canvas state BEFORE the
// element is drawn — sampling AFTER would treat the element's own freshly
// painted pixels as "previously dark" and flip its whole shape to white.
//
// Algorithm (two-phase):
//   1. captureReverseBg: snapshot the bbox region BEFORE the main draw.
//   2. ...renderer draws the element normally (in black)...
//   3. applyReverseOverlay: build a mask from the captured snapshot's
//      dark pixels, paint the element's shape in white masked to that
//      region, and composite it onto the main canvas. Where the
//      element's ink overlaps prior dark pixels it flips to white;
//      everywhere else the normally-drawn black stays put.

const DARK_PIXEL_THRESHOLD = 40 * 3;

/**
 * Snapshot the canvas bbox area before the element is drawn. Pass the
 * returned object to `applyReverseOverlay` after the draw.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {{x: number, y: number, width: number, height: number}} bbox
 * @returns {{imageData: ImageData, left: number, top: number, width: number, height: number} | null}
 */
export function captureReverseBg(ctx, canvas, bbox) {
  const left = Math.max(0, Math.floor(bbox.x));
  const top = Math.max(0, Math.floor(bbox.y));
  const right = Math.min(canvas.width, Math.ceil(bbox.x + bbox.width));
  const bottom = Math.min(canvas.height, Math.ceil(bbox.y + bbox.height));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  if (width === 0 || height === 0) return null;
  return { imageData: ctx.getImageData(left, top, width, height), left, top, width, height };
}

/**
 * Apply the reverse-print overlay using a previously captured bg snapshot.
 *
 * @param {CanvasRenderingContext2D} ctx - Main canvas context
 * @param {ReturnType<typeof captureReverseBg>} captured - Snapshot from captureReverseBg
 * @param {(tempCtx: CanvasRenderingContext2D, color: string, offsetX: number, offsetY: number) => void} drawShape -
 *   Callback that paints the element's shape on the temp context, in
 *   `color`, offset by (offsetX, offsetY) — same callback the renderer
 *   uses for the main draw, just with a different color.
 */
export function applyReverseOverlay(ctx, captured, drawShape) {
  if (!captured) return;
  const { imageData, left, top, width, height } = captured;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');
  const maskData = maskCtx.createImageData(width, height);
  const src = imageData.data;
  const dst = maskData.data;

  for (let i = 0; i < src.length; i += 4) {
    const brightness = src[i] + src[i + 1] + src[i + 2];
    if (brightness < DARK_PIXEL_THRESHOLD) {
      dst[i + 3] = 255;
    }
  }

  maskCtx.putImageData(maskData, 0, 0);

  const shapeCanvas = document.createElement('canvas');
  shapeCanvas.width = width;
  shapeCanvas.height = height;
  const shapeCtx = shapeCanvas.getContext('2d');
  drawShape(shapeCtx, '#FFFFFF', -left, -top);
  shapeCtx.globalCompositeOperation = 'destination-in';
  shapeCtx.drawImage(maskCanvas, 0, 0);

  ctx.drawImage(shapeCanvas, left, top);
}
