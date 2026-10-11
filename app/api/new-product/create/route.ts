import { trimArt } from "@/lib/mockup";
import { createProduct, printifyEditUrl, printifyTemplate, uploadArt } from "@/lib/printify-write";
import { adminUrl, createDraftProduct, designKey, findClashes, handleFor, shopifyTemplate, skuFor } from "@/lib/shopify-write";

export const maxDuration = 180;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Step 3: Printify product (saved, never published) first, then the Shopify DRAFT with the mockup.
export async function POST(request: Request) {
  const done: { printify?: { id: string; url: string } } = {};
  try {
    const b = await request.json();
    const title = String(b.title || "").trim();
    if (!title) return Response.json({ error: "Add a title." }, { status: 400 });
    const handle = handleFor(title);
    const design = designKey(title);
    const tags: string[] = (b.tags || []).map((t: string) => String(t).trim()).filter(Boolean);

    const clashes = await findClashes(handle, design);
    if (clashes.length && !b.allowDuplicate) {
      return Response.json({ error: `Already in Shopify: ${clashes.map((c) => c.title).join(", ")}. Change the title, or tick "Create anyway".` }, { status: 409 });
    }

    if (!process.env.PRINTIFY_API_TOKEN) throw new Error("PRINTIFY_API_TOKEN isn't set in Vercel.");
    const [pt, st, raw] = await Promise.all([
      printifyTemplate(),
      shopifyTemplate(),
      fetch(String(b.artUrl)).then(async (r) => {
        if (!r.ok) throw new Error(`Couldn't re-read the art (${r.status})`);
        return Buffer.from(await r.arrayBuffer());
      }),
    ]);

    // Printify gets the trimmed print file at full resolution; the pixels themselves are untouched.
    const art = await trimArt(raw);
    const upload = await uploadArt(`${handle}.png`, art.png);
    const p = await createProduct({
      t: pt,
      title,
      description: String(b.description || ""),
      imageId: upload.id,
      imageW: upload.width || art.width,
      imageH: upload.height || art.height,
      skuFor: (size) => skuFor(design, size),
    });
    done.printify = { id: p.id, url: printifyEditUrl(pt.shopId, p.id) };

    const description = String(b.description || "").trim();
    const product = await createDraftProduct(
      {
        title,
        handle,
        design,
        descriptionHtml: description ? `<p>${esc(description)}</p>` : "",
        seoTitle: String(b.seoTitle || ""),
        seoDescription: String(b.seoDescription || ""),
        tags,
        mockupResourceUrl: String(b.mockupResourceUrl),
        mockupAlt: String(b.alt || `${title} by CREEPTEE`),
      },
      st,
    );

    const warnings: string[] = [];
    if (product.note) warnings.push(product.note);
    if (p.skuMismatches.length) warnings.push(`Printify kept its own SKUs on: ${p.skuMismatches.join(", ")}. Set them to the CREEP- SKUs in Printify (Save as draft, don't publish) or orders won't import.`);

    return Response.json({
      ok: true,
      design,
      printify: { ...done.printify, template: pt.title },
      shopify: { id: product.id, handle: product.handle, admin: adminUrl(product.id) },
      collections: st.collections.map((c) => c.title),
      warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[new-product create] ${message}`);
    return Response.json({ error: message, printify: done.printify }, { status: 500 });
  }
}
