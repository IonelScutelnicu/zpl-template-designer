/**
 * Load an image and reject with a caller-specific error if decoding fails.
 *
 * @param {string} src
 * @param {string} [errorMessage]
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src, errorMessage = 'Failed to load image') {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
    image.src = src;
  });
}
