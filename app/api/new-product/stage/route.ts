import { stageUpload } from "@/lib/shopify-write";

// Step 1: a signed upload target, so the browser can send the full-size print file straight to Shopify
// (Vercel caps request bodies at 4.5 MB; print files are bigger).
export async function POST(request: Request) {
  try {
    const { filename, mimeType, size } = await request.json();
    if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) return Response.json({ error: "Upload a PNG (transparent background), JPG or WebP." }, { status: 400 });
    if (size > 20 * 1024 * 1024) return Response.json({ error: "That file is over 20 MB, Shopify's limit. Export the PNG a little smaller." }, { status: 400 });
    return Response.json(await stageUpload(String(filename), mimeType, Number(size)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
