import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// CREEPTEE product-image standard (Sep 2026): the Comfort Colors 1717 black blank, on a charcoal
// background with the design blown up and darkened behind it. 2000x2500 (4:5), same as the catalog.
// The art on the shirt is only trimmed and resized — never recolored, shaded or blurred.
const W = 2000;
const H = 2500;

// Print box on the shirt, measured from the current catalog mockups: ~790px wide (14" print),
// top edge ~3.5" below the collar seam, centered on the shirt's body axis.
const PRINT = { centerX: 1002, top: 650, maxW: 790, maxH: 1000 };

const BASE = [27, 26, 24]; // charcoal
const GHOST = [75, 70, 62]; // the color full-white art reaches in the darkened backdrop
const BG_ART_SCALE = 3.3; // backdrop art width relative to the printed art width

const SHIRT = path.join(process.cwd(), "lib/assets/cc1717-black-cutout.png");

/** Trims transparent padding so placement depends on the visible design, not the canvas. Pixels are untouched. */
export async function trimArt(art: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(art).ensureAlpha().trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  return { png: data, width: info.width, height: info.height };
}

/** Small JPEG for previews in the browser and for the copywriter. */
export async function preview(img: Buffer, width = 640): Promise<Buffer> {
  return sharp(img).resize({ width }).flatten({ background: "#1b1a18" }).jpeg({ quality: 82 }).toBuffer();
}

/** Builds the product mockup from already-trimmed art (see trimArt). */
export async function buildMockup(trimmed: Buffer): Promise<Buffer> {
  const meta = await sharp(trimmed).metadata();
  const aw = meta.width || 1;
  const ah = meta.height || 1;

  const scale = Math.min(PRINT.maxW / aw, PRINT.maxH / ah);
  const pw = Math.round(aw * scale);
  const ph = Math.round(ah * scale);
  const printed = await sharp(trimmed).resize(pw, ph, { kernel: "lanczos3" }).png().toBuffer();

  const backdrop = await buildBackdrop(trimmed, Math.round(pw * BG_ART_SCALE));
  const shirt = await readFile(SHIRT);

  return sharp(backdrop, { raw: { width: W, height: H, channels: 3 } })
    .composite([
      { input: shirt, left: 0, top: 0 },
      { input: printed, left: Math.round(PRINT.centerX - pw / 2), top: PRINT.top },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// Charcoal canvas with the art enlarged, centered, and pushed down to a dim warm grey.
async function buildBackdrop(art: Buffer, width: number): Promise<Buffer> {
  const { data, info } = await sharp(art).resize({ width, kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(W * H * 3);
  const ox = Math.round((W - info.width) / 2);
  const oy = Math.round((H - info.height) / 2);

  for (let y = 0; y < H; y++) {
    // Soft vignette so the edges sit a touch darker than the middle.
    const vy = (y - H / 2) / (H / 2);
    for (let x = 0; x < W; x++) {
      const vx = (x - W / 2) / (W / 2);
      const vig = 1 - 0.1 * Math.min(1, (vx * vx + vy * vy) / 2);
      let k = 0;
      const sx = x - ox;
      const sy = y - oy;
      if (sx >= 0 && sy >= 0 && sx < info.width && sy < info.height) {
        const i = (sy * info.width + sx) * 4;
        const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        k = (data[i + 3] / 255) * lum;
      }
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round((BASE[c] + (GHOST[c] - BASE[c]) * k) * vig);
    }
  }
  return out;
}
