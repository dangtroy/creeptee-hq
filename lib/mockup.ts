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

/** Story/Reels height: same 2000px width at 9:16. */
export const STORY_H = Math.round((W * 16) / 9);

/**
 * Builds the product mockup from already-trimmed art (see trimArt). `canvasH` makes a taller canvas
 * (e.g. STORY_H for 9:16 ads) with the same shirt, centered, and the backdrop filling the extra space.
 */
export async function buildMockup(trimmed: Buffer, canvasH = H): Promise<Buffer> {
  const dy = Math.round((canvasH - H) / 2);
  const meta = await sharp(trimmed).metadata();
  const aw = meta.width || 1;
  const ah = meta.height || 1;

  const scale = Math.min(PRINT.maxW / aw, PRINT.maxH / ah);
  const pw = Math.round(aw * scale);
  const ph = Math.round(ah * scale);
  const printed = await sharp(trimmed).resize(pw, ph, { kernel: "lanczos3" }).png().toBuffer();

  const backdrop = await buildBackdrop(trimmed, Math.round(pw * BG_ART_SCALE), canvasH);
  const shirt = await readFile(SHIRT);

  return sharp(backdrop, { raw: { width: W, height: canvasH, channels: 3 } })
    .composite([
      { input: shirt, left: 0, top: dy },
      { input: printed, left: Math.round(PRINT.centerX - pw / 2), top: PRINT.top + dy },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// Charcoal canvas with the art enlarged, centered, and pushed down to a dim warm grey.
async function buildBackdrop(art: Buffer, width: number, H: number): Promise<Buffer> {
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

/**
 * 9:16 version of an existing 4:5 product image when there's no print file to rebuild from:
 * the image sits centered, untouched, on a blurred and darkened copy of itself.
 */
export async function storyFromImage(img: Buffer): Promise<Buffer> {
  const inner = await sharp(img).resize({ width: W, height: H, fit: "cover" }).png().toBuffer();
  const bg = await sharp(img).resize({ width: W, height: STORY_H, fit: "cover" }).blur(40).modulate({ brightness: 0.45 }).png().toBuffer();
  return sharp(bg).composite([{ input: inner, left: 0, top: Math.round((STORY_H - H) / 2) }]).png().toBuffer();
}

/** Both ad sizes for a product: rebuilt from the print file when we have it, else from the product image. */
export async function adImages(opts: { printFileUrl: string | null; productImageUrl: string | null }): Promise<{ feed: Buffer; story: Buffer; source: "print file" | "product image" }> {
  const fetchBuf = async (u: string) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Couldn't download ${u.split("?")[0].split("/").pop()} (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  };
  if (opts.printFileUrl) {
    const art = await trimArt(await fetchBuf(opts.printFileUrl));
    const [feed, story] = await Promise.all([buildMockup(art.png), buildMockup(art.png, STORY_H)]);
    return { feed, story, source: "print file" };
  }
  if (!opts.productImageUrl) throw new Error("This product has no image and no saved print file to build ads from.");
  const img = await fetchBuf(opts.productImageUrl);
  const feed = await sharp(img).resize({ width: W, height: H, fit: "cover" }).png().toBuffer();
  return { feed, story: await storyFromImage(img), source: "product image" };
}
