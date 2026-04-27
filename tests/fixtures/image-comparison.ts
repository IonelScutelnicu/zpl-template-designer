import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface ComparisonResult {
    match: boolean;
    diffPixels: number;
    diffPercentage: number;
    diffImagePath?: string;
}

export interface ComparisonOptions {
    threshold?: number; // 0-1, default 0.1
    includeAA?: boolean; // include anti-aliased pixels
    saveDiffImage?: boolean;
    diffOutputDir?: string;
}

const DEFAULT_OPTIONS: ComparisonOptions = {
    threshold: 0.1,
    includeAA: false,
    saveDiffImage: true,
    diffOutputDir: path.join(__dirname, '../fixtures/visual-diffs'),
};

/**
 * Compare two images using pixelmatch
 * @param image1 First image buffer (PNG)
 * @param image2 Second image buffer (PNG)
 * @param name Name for the comparison (used for diff file naming)
 * @param options Comparison options
 * @returns Comparison result with match status and diff details
 */
export async function compareImages(
    image1: Buffer,
    image2: Buffer,
    name: string,
    options: ComparisonOptions = {}
): Promise<ComparisonResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const png1 = PNG.sync.read(image1);
    const png2 = PNG.sync.read(image2);

    // Handle different sizes by creating a common canvas
    const width = Math.max(png1.width, png2.width);
    const height = Math.max(png1.height, png2.height);

    // Resize images to common dimensions if needed
    const img1Data = resizeImage(png1, width, height);
    const img2Data = resizeImage(png2, width, height);

    const diff = new PNG({ width, height });

    const diffPixels = pixelmatch(
        img1Data,
        img2Data,
        diff.data,
        width,
        height,
        {
            threshold: opts.threshold!,
            includeAA: opts.includeAA,
        }
    );

    const totalPixels = width * height;
    const diffPercentage = (diffPixels / totalPixels) * 100;
    const match = diffPixels === 0;

    let diffImagePath: string | undefined;

    if (opts.saveDiffImage && diffPixels > 0) {
        // Ensure diff directory exists
        if (!fs.existsSync(opts.diffOutputDir!)) {
            fs.mkdirSync(opts.diffOutputDir!, { recursive: true });
        }

        diffImagePath = path.join(opts.diffOutputDir!, `${name}-diff.png`);
        fs.writeFileSync(diffImagePath, PNG.sync.write(diff));
    }

    return {
        match,
        diffPixels,
        diffPercentage,
        diffImagePath,
    };
}

/**
 * Resize an image to target dimensions (pads with white if smaller)
 */
function resizeImage(png: PNG, targetWidth: number, targetHeight: number): Buffer {
    if (png.width === targetWidth && png.height === targetHeight) {
        return png.data;
    }

    const resized = new PNG({ width: targetWidth, height: targetHeight });

    // Fill with white background
    for (let i = 0; i < resized.data.length; i += 4) {
        resized.data[i] = 255;     // R
        resized.data[i + 1] = 255; // G
        resized.data[i + 2] = 255; // B
        resized.data[i + 3] = 255; // A
    }

    // Copy original image data
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const srcIdx = (y * png.width + x) * 4;
            const dstIdx = (y * targetWidth + x) * 4;
            resized.data[dstIdx] = png.data[srcIdx];
            resized.data[dstIdx + 1] = png.data[srcIdx + 1];
            resized.data[dstIdx + 2] = png.data[srcIdx + 2];
            resized.data[dstIdx + 3] = png.data[srcIdx + 3];
        }
    }

    return resized.data;
}

/**
 * Compare an image against a baseline
 * @param actualImage Current screenshot buffer
 * @param baselineName Name of the baseline (without extension)
 * @param options Comparison options
 * @returns Comparison result
 */
export async function compareWithBaseline(
    actualImage: Buffer,
    baselineName: string,
    options: ComparisonOptions = {}
): Promise<ComparisonResult> {
    const baselineDir = path.join(__dirname, '../fixtures/baselines');
    const baselinePath = path.join(baselineDir, `${baselineName}.png`);

    if (process.env.GENERATE_BASELINES === '1') {
        if (!fs.existsSync(baselineDir)) {
            fs.mkdirSync(baselineDir, { recursive: true });
        }
        fs.writeFileSync(baselinePath, actualImage);
        console.log(`Saved baseline: ${baselinePath}`);
        return { match: true, diffPixels: 0, diffPercentage: 0 };
    }

    if (!fs.existsSync(baselinePath)) {
        return {
            match: false,
            diffPixels: -1,
            diffPercentage: 100,
            diffImagePath: undefined,
        };
    }

    const baselineImage = fs.readFileSync(baselinePath);
    return compareImages(baselineImage, actualImage, baselineName, options);
}


export interface ContentBounds {
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
}

/**
 * Find the bounding box of dark pixels in a PNG image
 * @param imageBuffer PNG image buffer
 * @param maxBrightness Max brightness (0-255) to count as content. Default 128 (dark pixels only).
 * @returns Bounding box of detected content
 */
export function findContentBounds(imageBuffer: Buffer, maxBrightness: number = 128): ContentBounds {
    const png = PNG.sync.read(imageBuffer);
    let top = png.height;
    let left = png.width;
    let bottom = 0;
    let right = 0;

    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const idx = (y * png.width + x) * 4;
            const r = png.data[idx];
            const g = png.data[idx + 1];
            const b = png.data[idx + 2];

            if (r <= maxBrightness && g <= maxBrightness && b <= maxBrightness) {
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
            }
        }
    }

    if (top > bottom || left > right) {
        return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
    }

    return {
        top,
        left,
        bottom,
        right,
        width: right - left + 1,
        height: bottom - top + 1,
    };
}

/**
 * Get the pixel dimensions of a PNG image
 */
export function getImageDimensions(imageBuffer: Buffer): { width: number; height: number } {
    const png = PNG.sync.read(imageBuffer);
    return { width: png.width, height: png.height };
}

