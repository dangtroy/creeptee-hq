import { gql } from "./shopify";

// Optional AI copywriter for new products. Uses the Claude API when ANTHROPIC_API_KEY is set;
// without it the form just starts from plain defaults you fill in yourself.
export type ProductCopy = {
  description: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  alt: string;
};

const bare = (title: string) => title.trim().replace(/\s+tee$/i, "");

export function defaultCopy(title: string): ProductCopy {
  const t = bare(title);
  return {
    description: "",
    seoTitle: `${t} Tee | CREEPTEE`,
    seoDescription: "",
    tags: [],
    alt: `${t} graphic on black t-shirt – ${t} Tee by CREEPTEE`,
  };
}

async function tagVocabulary(): Promise<string[]> {
  const tags: string[] = [];
  let after: string | null = null;
  for (let i = 0; i < 4; i++) {
    const d: any = await gql(`query($after: String) { productTags(first: 250, after: $after) { nodes pageInfo { hasNextPage endCursor } } }`, { after });
    tags.push(...d.productTags.nodes);
    if (!d.productTags.pageInfo.hasNextPage) break;
    after = d.productTags.pageInfo.endCursor;
  }
  // Housekeeping tags that should never be added by hand.
  return tags.filter((t) => !/exclude|NOREVIEWS|klaviyo|subscriber-exclusive|LIMITED-RUN|limited-edition|halloween-2026/i.test(t));
}

const BRIEF = `You write product copy for CREEPTEE, a graphic tee brand built on original artwork.
Voice: deadpan, self-aware dark comedy. Morbid, dry, confident understatement. Never exclamation marks, never "perfect for", never hype words.
Every tee is a black Comfort Colors heavyweight garment-dyed tee, sizes SM to 4XL, $29.

Examples of the house style:
- Title: What Am I Doing With My Lives Tee
  Description: A cat in a bedsheet ghost costume under the moon. Nine lives in and still no plan.
  SEO title: What Am I Doing With My Lives Ghost Cat Tee | CREEPTEE
  SEO description: A cat in a bedsheet ghost costume under the moon, nine lives deep and still asking what it's doing with them. Black Comfort Colors tee, SM to 4XL.
- Title: We Could Kill You If We Want To Tee
  Description: Two very small, very soft kittens with a very clear message. They're choosing not to. For now.
- Title: What A Time To Be Alive Tee
  Description: One cat, eyes half shut, taking in the state of everything. Says it all, really.`;

export async function writeCopy(title: string, artJpeg: Buffer): Promise<ProductCopy | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const vocab = await tagVocabulary();

  const ask = `${BRIEF}

Look at the attached artwork for the tee titled "${title}". Describe only what is actually in the art.
Return JSON only, no prose, with these keys:
- "description": 1–2 short sentences in the house style (first sentence says plainly what the art shows, second is the deadpan turn).
- "seoTitle": under 60 characters, ends with " | CREEPTEE", adds a plain search term (e.g. "Ghost Cat Tee").
- "seoDescription": 130–155 characters, what the art shows plus "Black Comfort Colors tee, SM to 4XL."
- "tags": 6–12 tags chosen ONLY from this existing list (exact spelling): ${JSON.stringify(vocab)}
- "alt": alt text, "<what the art shows> graphic on black t-shirt – ${bare(title)} Tee by CREEPTEE"`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: artJpeg.toString("base64") } },
            { type: "text", text: ask },
          ],
        },
      ],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Copywriter ${res.status}: ${body?.error?.message || "request failed"}`);
  const text: string = body?.content?.find((c: any) => c.type === "text")?.text || "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const out = JSON.parse(json);
  const allowed = new Set(vocab);
  const fallback = defaultCopy(title);
  return {
    description: String(out.description || ""),
    seoTitle: String(out.seoTitle || fallback.seoTitle),
    seoDescription: String(out.seoDescription || ""),
    tags: (Array.isArray(out.tags) ? out.tags : []).map(String).filter((t: string) => allowed.has(t)),
    alt: String(out.alt || fallback.alt),
  };
}
