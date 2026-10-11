import { defaultCopy, writeCopy } from "@/lib/copy";
import { buildMockup, preview, trimArt } from "@/lib/mockup";
import { createFileAndWait, designKey, findClashes, handleFor, skuFor, uploadBuffer } from "@/lib/shopify-write";

export const maxDuration = 120;

// Step 2: register the uploaded art in Shopify Files, build the mockup, draft the copy.
// Nothing is created in Printify or as a product yet.
export async function POST(request: Request) {
  try {
    const { resourceUrl, title } = await request.json();
    const name = String(title || "").trim().replace(/\s+tee$/i, "") + " Tee";
    const art = await createFileAndWait(resourceUrl, `${name} – print file`);
    const raw = Buffer.from(await (await fetch(art.url)).arrayBuffer());
    const trimmed = await trimArt(raw);

    const handle = handleFor(name);
    const mockup = await buildMockup(trimmed.png);
    const [mockupResourceUrl, clashes, copy] = await Promise.all([
      uploadBuffer(`${handle}_mockup_bg.png`, "image/png", mockup),
      findClashes(handle, designKey(name)),
      writeCopy(name, await preview(trimmed.png, 1024)).catch((e) => {
        console.error(`[copywriter] ${e instanceof Error ? e.message : e}`);
        return null;
      }),
    ]);

    const warnings: string[] = [];
    if (trimmed.width < 2400) warnings.push(`The art is only ${trimmed.width}px wide once trimmed. Printify prints best from the 5000px "Final" master.`);
    if (!process.env.ANTHROPIC_API_KEY) warnings.push("Copy wasn't drafted: add ANTHROPIC_API_KEY in Vercel to have it written for you.");
    else if (!copy) warnings.push("The copywriter didn't answer, so the copy fields start blank.");

    const design = designKey(name);
    return Response.json({
      title: name,
      handle,
      design,
      skuExample: skuFor(design, "LG"),
      artUrl: art.url,
      artSize: { width: trimmed.width, height: trimmed.height },
      mockupResourceUrl,
      mockupPreview: `data:image/jpeg;base64,${(await preview(mockup, 720)).toString("base64")}`,
      copy: copy || defaultCopy(name),
      aiCopy: Boolean(copy),
      clashes,
      warnings,
    });
  } catch (e) {
    console.error(`[new-product prepare] ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
