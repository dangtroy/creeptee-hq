import { adImages } from "@/lib/mockup";
import { adsManagerUrl, createPausedAd, uploadImage } from "@/lib/meta-write";
import { designKey, findPrintFile, productById } from "@/lib/shopify-write";

export const maxDuration = 180;

// Uploads both images once, then one PAUSED ad per chosen ad set. Nothing goes live from here.
export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!process.env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN isn't set in Vercel.");
    const adsetIds: string[] = (b.adsetIds || []).map(String);
    if (!adsetIds.length) return Response.json({ error: "Pick at least one ad set." }, { status: 400 });
    const primaryText = String(b.primaryText || "").trim();
    const headline = String(b.headline || "").trim();
    const link = String(b.link || "").trim();
    if (!primaryText || !headline || !/^https:\/\//.test(link)) return Response.json({ error: "Primary text, headline and an https link are all needed." }, { status: 400 });

    const p = await productById(String(b.productId));
    const imgs = await adImages({ printFileUrl: await findPrintFile(p.title), productImageUrl: p.image });
    const key = designKey(p.title);
    const [feedHash, storyHash] = await Promise.all([uploadImage(`${key}_4x5.png`, imgs.feed), uploadImage(`${key}_9x16.png`, imgs.story)]);

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const results = [];
    for (const adsetId of adsetIds) {
      try {
        const ad = await createPausedAd({ name: `${key}_Mockup_${stamp}`, adsetId, link, primaryText, headline, feedHash, storyHash });
        results.push({ adsetId, ok: true, ...ad });
      } catch (e) {
        results.push({ adsetId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const warnings: string[] = [];
    if (p.status !== "ACTIVE") warnings.push(`${p.title} is still a ${p.status.toLowerCase()} in Shopify, so the ad link won't work until you set it to Active.`);
    return Response.json({ ok: results.some((r) => r.ok), results, adsManager: adsManagerUrl(), warnings });
  } catch (e) {
    console.error(`[ads create] ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
