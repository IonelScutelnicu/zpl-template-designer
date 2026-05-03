// Graphic Field (^GF) helpers
// Image rasterization, bitmap packing, and ZPL ^GFA encoding/decoding.

/**
 * CRC-16/CCITT (poly 0x1021, init 0x0000), as used by Zebra ^GF :B64:/:Z64:.
 * Computed over the base64 string bytes.
 * @param {string} str
 * @returns {number} 16-bit CRC
 */
export function crc16Ccitt(str) {
  let crc = 0x0000;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xFF) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc;
}

/**
 * Pack raw bytes to upper-case ASCII hex (no separators).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }
  return out;
}

/**
 * Decode a plain ASCII-hex string into bytes. Whitespace and CR/LF are tolerated.
 * Returns null if the input contains non-hex characters (caller should treat
 * as opaque; we don't support ACS run-length encoding).
 * @param {string} hex
 * @returns {Uint8Array|null}
 */
export function hexToBytes(hex) {
  const cleaned = hex.replace(/\s+/g, '');
  if (!/^[0-9A-Fa-f]*$/.test(cleaned)) return null;
  const len = Math.floor(cleaned.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Encode bytes to a Zebra :B64: payload (`:B64:<base64>:<crcHex>`).
 * The CRC is computed over the base64 string itself.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToB64WithCrc(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const crc = crc16Ccitt(b64).toString(16).toUpperCase().padStart(4, '0');
  return `:B64:${b64}:${crc}`;
}

/**
 * Decode a Zebra :B64: payload. Accepts forms with or without trailing CRC.
 * Returns { bytes, crcOk, crcPresent }. crcOk is true when CRC matches OR
 * when no CRC is present (callers should check crcPresent if they care).
 * @param {string} payload  e.g. ":B64:iVBOR...:A1B2" or ":B64:iVBOR..."
 * @returns {{bytes: Uint8Array, crcOk: boolean, crcPresent: boolean}|null}
 */
export function b64WithCrcToBytes(payload) {
  if (!payload.startsWith(':B64:')) return null;
  const rest = payload.slice(5);
  const lastColon = rest.lastIndexOf(':');
  let b64, crcStr;
  if (lastColon === -1) {
    b64 = rest;
    crcStr = null;
  } else {
    b64 = rest.slice(0, lastColon);
    crcStr = rest.slice(lastColon + 1);
    if (!/^[0-9A-Fa-f]{1,4}$/.test(crcStr)) {
      // Trailing colon was something else; treat the whole thing as data.
      b64 = rest;
      crcStr = null;
    }
  }
  let bin;
  try { bin = atob(b64); } catch { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let crcOk = true;
  const crcPresent = crcStr !== null;
  if (crcPresent) {
    const expected = parseInt(crcStr, 16);
    crcOk = crc16Ccitt(b64) === expected;
  }
  return { bytes, crcOk, crcPresent };
}

/**
 * Rotate a 1-bit-packed bitmap (MSB-first, row-major) by N (0°), R (90° CW),
 * I (180°), or B (270° CW / 90° CCW). Real Zebra firmware ignores ^FW for
 * ^GF, so rotation has to be baked into the bitmap before emitting ^GFA.
 *
 * @param {Uint8Array} bytes
 * @param {number} widthDots
 * @param {number} heightDots
 * @param {number} bytesPerRow
 * @param {string} orientation  'N' | 'R' | 'I' | 'B'
 * @returns {{bytes: Uint8Array, widthDots: number, heightDots: number, bytesPerRow: number}}
 */
export function rotateBitmap(bytes, widthDots, heightDots, bytesPerRow, orientation) {
  if (!orientation || orientation === 'N') {
    return { bytes, widthDots, heightDots, bytesPerRow };
  }

  const W = widthDots;
  const H = heightDots;
  const swap = orientation === 'R' || orientation === 'B';
  const newW = swap ? H : W;
  const newH = swap ? W : H;
  const newBytesPerRow = Math.ceil(newW / 8);
  const out = new Uint8Array(newBytesPerRow * newH);

  // Read bit at (x, y) from the source bitmap. Returns 0 or 1.
  const readBit = (x, y) => (bytes[y * bytesPerRow + (x >> 3)] >> (7 - (x & 7))) & 1;

  // Map (newX, newY) -> source (origX, origY) per orientation.
  let mapFn;
  if (orientation === 'R') {
    // 90° CW: new[x,y] = orig[y, H-1-x]
    mapFn = (nx, ny) => [ny, H - 1 - nx];
  } else if (orientation === 'I') {
    // 180°: new[x,y] = orig[W-1-x, H-1-y]
    mapFn = (nx, ny) => [W - 1 - nx, H - 1 - ny];
  } else {
    // B = 270° CW: new[x,y] = orig[W-1-y, x]
    mapFn = (nx, ny) => [W - 1 - ny, nx];
  }

  for (let ny = 0; ny < newH; ny++) {
    for (let nx = 0; nx < newW; nx++) {
      const [ox, oy] = mapFn(nx, ny);
      if (ox < 0 || ox >= W || oy < 0 || oy >= H) continue;
      if (!readBit(ox, oy)) continue;
      out[ny * newBytesPerRow + (nx >> 3)] |= (0x80 >> (nx & 7));
    }
  }

  return { bytes: out, widthDots: newW, heightDots: newH, bytesPerRow: newBytesPerRow };
}

/**
 * Render a 1-bit-packed bitmap (1 = black) into an RGBA ImageData.
 * Treats trailing padding bits in the row as white.
 * @param {Uint8Array} bytes
 * @param {number} widthDots  pixel width to render (≤ bytesPerRow*8)
 * @param {number} heightDots
 * @param {number} bytesPerRow
 * @returns {ImageData}
 */
export function bitmapToImageData(bytes, widthDots, heightDots, bytesPerRow) {
  const data = new Uint8ClampedArray(widthDots * heightDots * 4);
  for (let y = 0; y < heightDots; y++) {
    for (let x = 0; x < widthDots; x++) {
      const byteIdx = y * bytesPerRow + (x >> 3);
      const bit = bytes[byteIdx] >> (7 - (x & 7)) & 1;
      const o = (y * widthDots + x) * 4;
      // bit=1 → black, opaque; bit=0 → white, transparent
      if (bit) {
        data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255;
      }
      // else: all zeros (transparent) — Uint8ClampedArray is zero-initialized
    }
  }
  return new ImageData(data, widthDots, heightDots);
}

/**
 * Rasterize an image (data URL) to a 1-bit packed bitmap at a target width.
 * Pads the canvas to a multiple of 8 to avoid edge artifacts; cropped pixels
 * past widthDots within the last byte stay white.
 *
 * @param {string} dataUrl
 * @param {number} widthDots target width in printer dots
 * @param {number} threshold luminance cutoff (0-255), pixel is black if lum < threshold
 * @param {number} [heightDots] optional height override; when omitted, height
 *   is derived from the source image aspect ratio
 * @returns {Promise<{bytes: Uint8Array, widthDots: number, heightDots: number, bytesPerRow: number, imageData: ImageData, sourceWidth: number, sourceHeight: number}>}
 */
export function imageToBitmap(dataUrl, widthDots, threshold = 128, heightDots = null) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalHeight / img.naturalWidth;
      const finalHeight = (heightDots && heightDots > 0)
        ? Math.max(1, Math.round(heightDots))
        : Math.max(1, Math.round(widthDots * aspect));
      const bytesPerRow = Math.ceil(widthDots / 8);
      const paddedWidth = bytesPerRow * 8;

      const canvas = document.createElement('canvas');
      canvas.width = paddedWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, paddedWidth, finalHeight);
      ctx.drawImage(img, 0, 0, widthDots, finalHeight);

      const px = ctx.getImageData(0, 0, paddedWidth, finalHeight).data;
      const total = bytesPerRow * finalHeight;
      const bytes = new Uint8Array(total);

      for (let y = 0; y < finalHeight; y++) {
        for (let bx = 0; bx < bytesPerRow; bx++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = bx * 8 + bit;
            if (x >= widthDots) break;
            const o = (y * paddedWidth + x) * 4;
            const lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
            if (lum < threshold) byte |= (0x80 >> bit);
          }
          bytes[y * bytesPerRow + bx] = byte;
        }
      }

      const imageData = bitmapToImageData(bytes, widthDots, finalHeight, bytesPerRow);
      resolve({
        bytes, widthDots, heightDots: finalHeight, bytesPerRow, imageData,
        sourceWidth: img.naturalWidth, sourceHeight: img.naturalHeight,
        naturalAspectRatio: aspect,
      });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
