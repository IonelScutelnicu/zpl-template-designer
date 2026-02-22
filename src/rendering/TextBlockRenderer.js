// Text Block Renderer
// Renders TEXTBLOCK elements on canvas with word wrapping and justification

import { ZPL_FONTS } from '../config/constants.js';

/**
 * Renderer for TEXTBLOCK elements
 */
export class TextBlockRenderer {
  /**
   * Render a TEXTBLOCK element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Canvas element (for reverse overlay)
   * @param {Object} element - TEXTBLOCK element
   * @param {Object} labelSettings - Label settings
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;

    // Use label default if element fontSize is 0 or not set
    const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
    const fontSize = rawFontSize * scale;
    const blockWidth = element.blockWidth * scale;

    // Get font ID from element or use label's default
    const fontId = element.fontId || labelSettings.fontId || '0';
    const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    // Calculate horizontal scale for font aspect ratio
    // Use label default if element fontWidth is 0 or not set
    const rawFontWidth = element.fontWidth || labelSettings.defaultFontWidth || 20;
    const fontWidth = rawFontWidth * scale;
    const scaleX = fontWidth / fontSize;

    ctx.font = font;
    ctx.textBaseline = 'top';

    // Nudge text upward to better match ZPL printer positioning.
    const yOffset = fontSize * -0.05;

    const text = element.previewText || '';

    const hangingIndentPx = (element.hangingIndent || 0) * scale;

    // Simple text wrapping - account for horizontal scaling when measuring
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      // Apply scaleX to measured width for accurate wrapping
      const scaledWidth = metrics.width * scaleX;

      // First line: full blockWidth. Lines 2+: blockWidth minus hanging indent.
      const maxWidth = lines.length === 0
        ? blockWidth
        : Math.max(0, blockWidth - hangingIndentPx);

      if (scaledWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // Draw lines (respect maxLines)
    const maxLines = element.maxLines || lines.length;
    // Line spacing is only between lines, not after the last line
    const lineSpacing = (element.lineSpacing || 0) * scale;
    const baseLineHeight = fontSize * 1.2;
    const lineHeight = baseLineHeight + lineSpacing;
    const blockHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);

    const createReverseOverlay = () => {
      const left = Math.max(0, Math.floor(x));
      const top = Math.max(0, Math.floor(y));
      const right = Math.min(canvas.width, Math.ceil(x + blockWidth));
      const bottom = Math.min(canvas.height, Math.ceil(y + blockHeight));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (width === 0 || height === 0) return null;

      const imageData = ctx.getImageData(left, top, width, height);
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d');
      const maskData = maskCtx.createImageData(width, height);
      const src = imageData.data;
      const dst = maskData.data;
      const threshold = 40 * 3;

      for (let i = 0; i < src.length; i += 4) {
        const brightness = src[i] + src[i + 1] + src[i + 2];
        if (brightness < threshold) {
          dst[i + 3] = 255;
        }
      }

      maskCtx.putImageData(maskData, 0, 0);

      const textCanvas = document.createElement('canvas');
      textCanvas.width = width;
      textCanvas.height = height;
      const textCtx = textCanvas.getContext('2d');
      textCtx.font = font;
      textCtx.textBaseline = 'top';
      textCtx.fillStyle = '#FFFFFF';

      lines.slice(0, maxLines).forEach((line, i) => {
        const lineY = y - top + (i * lineHeight) + yOffset;
        const measuredWidth = textCtx.measureText(line).width * scaleX;
        const isFirstLine = i === 0;
        const indent = isFirstLine ? 0 : hangingIndentPx;
        const lineBlockWidth = isFirstLine ? blockWidth : Math.max(0, blockWidth - hangingIndentPx);
        const lineStartX = x - left + indent;

        let lineX = lineStartX;
        if (element.justification === 'C') {
          lineX = lineStartX + (lineBlockWidth - measuredWidth) / 2;
        } else if (element.justification === 'R') {
          lineX = lineStartX + lineBlockWidth - measuredWidth;
        }

        // Apply horizontal scaling for text rendering
        textCtx.save();
        textCtx.translate(lineX, lineY);
        textCtx.scale(scaleX, 1);
        textCtx.fillText(line, 0, 0);
        textCtx.restore();
      });

      textCtx.globalCompositeOperation = 'destination-in';
      textCtx.drawImage(maskCanvas, 0, 0);

      return { canvas: textCanvas, x: left, y: top };
    };

    const overlay = element.reverse ? createReverseOverlay() : null;
    ctx.fillStyle = '#000000';

    lines.slice(0, maxLines).forEach((line, i) => {
      const measuredWidth = ctx.measureText(line).width * scaleX;
      const lineY = y + (i * lineHeight) + yOffset;
      const isLastLine = (i === lines.slice(0, maxLines).length - 1);
      const isFirstLine = i === 0;
      const indent = isFirstLine ? 0 : hangingIndentPx;
      const lineBlockWidth = isFirstLine ? blockWidth : Math.max(0, blockWidth - hangingIndentPx);
      const lineStartX = x + indent;

      // Handle justified text
      if (element.justification === 'J') {
        const words = line.split(/\s+/).filter(w => w.length > 0);

        // Only justify if: not last line AND has multiple words AND line is shorter than block width
        if (!isLastLine && words.length > 1 && measuredWidth < lineBlockWidth) {
          // Measure individual words (without scaling first)
          const wordWidths = words.map(word => ctx.measureText(word).width * scaleX);
          const totalWordWidth = wordWidths.reduce((sum, w) => sum + w, 0);

          // Calculate space to distribute between words
          const spaceBetweenWords = (lineBlockWidth - totalWordWidth) / (words.length - 1);

          // Draw words with calculated spacing
          let currentX = lineStartX;
          words.forEach((word, wordIndex) => {
            ctx.save();
            ctx.translate(currentX, lineY);
            ctx.scale(scaleX, 1);
            ctx.fillText(word, 0, 0);
            ctx.restore();
            currentX += wordWidths[wordIndex] + spaceBetweenWords;
          });
          return; // Skip the normal rendering below
        }
        // Last line or single word: left-align (fall through)
      }

      let lineX = lineStartX;
      // Apply justification using scaled width
      if (element.justification === 'C') {
        lineX = lineStartX + (lineBlockWidth - measuredWidth) / 2;
      } else if (element.justification === 'R') {
        lineX = lineStartX + lineBlockWidth - measuredWidth;
      }

      // Apply horizontal scaling for text rendering
      ctx.save();
      ctx.translate(lineX, lineY);
      ctx.scale(scaleX, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });

    if (overlay) {
      ctx.drawImage(overlay.canvas, overlay.x, overlay.y);
    }
  }
}
