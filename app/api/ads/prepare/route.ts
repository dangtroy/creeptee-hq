import { adImages, preview } from "@/lib/mockup";
import { findPrintFile, productById, storeUrl } from "@/lib/shopify-write";

export const maxDuration = 120;

// Builds the 4:5 and 9:16 images and default copy for review. Nothing is sent to Meta.
export async function POST(request: Request) {
  try {
    const { productId } = await request.json();
    const p = await productById(String(productId));
    const imgs = await adImages({ printFileUrl: await findPrintFile(p.title), productImageUrl: p.image });
    const [feed, story] = await Promise.all([preview(imgs.feed, 480), preview(imgs.story, 360)]);
    return Response.json({
      product: p,
      source: imgs.source,
      feedPreview: `data:image/jpeg;base64,${feed.toString("base64")}`,
      storyPreview: `data:image/jpeg;base64,${story.toString("base64")}`,
      copy: {
        primaryText: p.description || p.title,
        headline: p.title,
        link: `${storeUrl()}/products/${p.handle}`,
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
