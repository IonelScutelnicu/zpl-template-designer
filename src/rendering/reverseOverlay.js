function getTransformedBounds(ctx, canvas, bbox, padding) {
  const transform = ctx.getTransform();
  const corners = [
    [bbox.x, bbox.y],
    [bbox.x + bbox.width, bbox.y],
    [bbox.x, bbox.y + bbox.height],
    [bbox.x + bbox.width, bbox.y + bbox.height]
  ].map(([x, y]) => ({
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f
  }));

  const left = Math.max(0, Math.floor(Math.min(...corners.map(point => point.x)) - padding));
  const top = Math.max(0, Math.floor(Math.min(...corners.map(point => point.y)) - padding));
  const right = Math.min(canvas.width, Math.ceil(Math.max(...corners.map(point => point.x)) + padding));
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...corners.map(point => point.y)) + padding));

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    transform
  };
}

function createShapeLayer(bounds, drawShape) {
  const shapeCanvas = document.createElement('canvas');
  shapeCanvas.width = bounds.width;
  shapeCanvas.height = bounds.height;
  const shapeCtx = shapeCanvas.getContext('2d');

  shapeCtx.setTransform(
    bounds.transform.a,
    bounds.transform.b,
    bounds.transform.c,
    bounds.transform.d,
    bounds.transform.e - bounds.left,
    bounds.transform.f - bounds.top
  );
  drawShape(shapeCtx, '#FFFFFF');

  return shapeCanvas;
}

function createTransparentLayers(canvas, bounds, shapeCanvas) {
  const backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.width = bounds.width;
  backgroundCanvas.height = bounds.height;
  const backgroundCtx = backgroundCanvas.getContext('2d');
  backgroundCtx.drawImage(
    canvas,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );

  // Split the completed field mask by the canvas's existing alpha. Difference
  // applies only over existing pixels; transparent pixels receive black ink
  // directly. This keeps anti-aliased edges from accumulating white then black.
  const opaqueCanvas = document.createElement('canvas');
  opaqueCanvas.width = bounds.width;
  opaqueCanvas.height = bounds.height;
  const opaqueCtx = opaqueCanvas.getContext('2d');
  opaqueCtx.drawImage(shapeCanvas, 0, 0);
  opaqueCtx.globalCompositeOperation = 'destination-in';
  opaqueCtx.drawImage(backgroundCanvas, 0, 0);

  const transparentCanvas = document.createElement('canvas');
  transparentCanvas.width = bounds.width;
  transparentCanvas.height = bounds.height;
  const transparentCtx = transparentCanvas.getContext('2d');
  transparentCtx.drawImage(backgroundCanvas, 0, 0);
  transparentCtx.globalCompositeOperation = 'source-out';
  transparentCtx.drawImage(shapeCanvas, 0, 0);
  transparentCtx.globalCompositeOperation = 'source-in';
  transparentCtx.fillStyle = '#000000';
  transparentCtx.fillRect(0, 0, bounds.width, bounds.height);

  return { opaqueCanvas, transparentCanvas };
}

/**
 * Draw an element with ZPL ^FR semantics without reading pixels back from the canvas.
 * Painting white with `difference` flips existing black/white pixels. Transparent
 * previews need one extra composited mask so transparent pixels become black.
 */
export function drawWithReverse(ctx, canvas, bbox, drawShape, {
  reverse = false,
  color = '#000000',
  transparentBackground = false,
  padding = 2
} = {}) {
  if (!reverse) {
    drawShape(ctx, color);
    return;
  }

  const bounds = getTransformedBounds(ctx, canvas, bbox, Math.max(0, padding));
  if (bounds.width === 0 || bounds.height === 0) return;

  // Buffer the complete field before applying `difference`. Canvas compositing
  // operates per draw call, so drawing glyphs or lines directly could invert an
  // overlapping pixel twice. One layer draw makes the field mask idempotent.
  const shapeCanvas = createShapeLayer(bounds, drawShape);
  const transparentLayers = transparentBackground
    ? createTransparentLayers(canvas, bounds, shapeCanvas)
    : null;

  ctx.save();
  ctx.resetTransform();
  ctx.globalCompositeOperation = 'difference';
  ctx.drawImage(transparentLayers?.opaqueCanvas || shapeCanvas, bounds.left, bounds.top);
  ctx.restore();

  if (transparentLayers) {
    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(transparentLayers.transparentCanvas, bounds.left, bounds.top);
    ctx.restore();
  }
}
