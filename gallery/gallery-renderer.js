import { CanvasRenderer } from '../src/canvas-renderer.js';
import { SerializationService } from '../src/services/SerializationService.js';

const serializationService = new SerializationService();

export function renderTemplateThumb(rawElements, labelSettings, maxSize) {
  maxSize = maxSize || 400;

  const elements = rawElements
    .map(function (data) { return serializationService.createElementFromData(data, { keepId: true }); })
    .filter(function (el) { return el !== null; });

  const offscreen = document.createElement('canvas');
  const renderer = new CanvasRenderer(offscreen);
  renderer.renderCanvas(elements, labelSettings, null);

  const src = renderer.canvas;
  if (!src.width || !src.height) return null;

  const scale = Math.min(maxSize / src.width, maxSize / src.height, 1);
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);

  const thumb = document.createElement('canvas');
  thumb.width = w;
  thumb.height = h;
  thumb.getContext('2d').drawImage(src, 0, 0, w, h);

  return thumb.toDataURL('image/png');
}
