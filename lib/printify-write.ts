import { getJson } from "./core";

// Write side of Printify for the New Product action. Products are created but NEVER published:
// publishing would push Printify's own listing and price over the Shopify product.
const BASE = "https://api.printify.com/v1";
const headers = () => ({
  Authorization: `Bearer ${process.env.PRINTIFY_API_TOKEN}`,
  "User-Agent": "creeptee-hq",
  "Content-Type": "application/json",
});
const pf = (path: string, init: RequestInit = {}) => getJson(`${BASE}${path}`, { ...init, headers: headers() }, "Printify");

// Printify size names → CREEPTEE size codes used in SKUs and on Shopify.
const SIZE_MAP: Record<string, string> = { XS: "XS", S: "SM", M: "MD", L: "LG", XL: "XL", "2XL": "2XL", "3XL": "3XL", "4XL": "4XL", "5XL": "5XL" };

async function shopId(): Promise<number> {
  if (process.env.PRINTIFY_SHOP_ID) return Number(process.env.PRINTIFY_SHOP_ID);
  const shops: any[] = await pf("/shops.json");
  const shop = shops.find((s) => /shopify/i.test(s.sales_channel || "")) || shops[0];
  if (!shop) throw new Error("Printify: no shops on this account");
  return shop.id;
}

export type PrintifyTemplate = {
  shopId: number;
  title: string;
  blueprintId: number;
  providerId: number;
  variants: { id: number; size: string }[];
  placement: { x: number; topFrac: number; widthFrac: number; angle: number };
  area: { width: number; height: number };
};

/**
 * Blueprint, print provider, enabled variants and print placement are copied from an existing CREEPTEE
 * product (PRINTIFY_TEMPLATE_PRODUCT_ID, or the newest product with CREEP- SKUs), so new tees match the catalog.
 */
export async function printifyTemplate(): Promise<PrintifyTemplate> {
  const shop = await shopId();
  let product: any;
  if (process.env.PRINTIFY_TEMPLATE_PRODUCT_ID) {
    product = await pf(`/shops/${shop}/products/${process.env.PRINTIFY_TEMPLATE_PRODUCT_ID}.json`);
  } else {
    const pages = await pf(`/shops/${shop}/products.json?limit=20&page=1`);
    const list: any[] = pages.data || [];
    product = list.find((p) => p.variants?.some((v: any) => /^CREEP-/.test(v.sku || ""))) || list[0];
  }
  if (!product) throw new Error("Printify: no existing product to copy settings from. Set PRINTIFY_TEMPLATE_PRODUCT_ID.");

  const variants = (product.variants || [])
    // Prefer the variants carrying CREEP- SKUs (some catalog products show them as disabled), else the enabled ones.
    .filter((v: any, _i: number, all: any[]) => (all.some((x) => /^CREEP-/.test(x.sku || "")) ? /^CREEP-/.test(v.sku || "") : v.is_enabled))
    .map((v: any) => {
      const raw = String(v.title || "").split("/").pop()!.trim().toUpperCase();
      return { id: v.id, size: SIZE_MAP[raw] || raw };
    });
  if (!variants.length) throw new Error(`Printify: "${product.title}" has no enabled variants to copy`);

  const catalog = await pf(`/catalog/blueprints/${product.blueprint_id}/print_providers/${product.print_provider_id}/variants.json`);
  const ph = (catalog.variants || []).find((v: any) => v.id === variants[0].id)?.placeholders?.find((p: any) => p.position === "front");
  const area = { width: ph?.width || 4500, height: ph?.height || 5100 };

  // Where the template's front image sits, expressed as top edge + width relative to the print area.
  const img = product.print_areas?.flatMap((a: any) => a.placeholders || []).find((p: any) => p.position === "front")?.images?.[0];
  let placement = { x: 0.5, topFrac: 0.05, widthFrac: 0.9, angle: 0 };
  if (img?.width && img?.height && img?.scale) {
    const hFrac = (img.scale * area.width * (img.height / img.width)) / area.height;
    placement = { x: img.x ?? 0.5, topFrac: Math.max(0, (img.y ?? 0.5) - hFrac / 2), widthFrac: img.scale, angle: img.angle || 0 };
  }

  return { shopId: shop, title: product.title, blueprintId: product.blueprint_id, providerId: product.print_provider_id, variants, placement, area };
}

/** Uploads the print file (base64) to the Printify media library. */
export async function uploadArt(fileName: string, png: Buffer): Promise<{ id: string; width: number; height: number }> {
  const r = await pf("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({ file_name: fileName, contents: png.toString("base64") }),
  });
  return { id: r.id, width: r.width, height: r.height };
}

export async function createProduct(opts: {
  t: PrintifyTemplate;
  title: string;
  description: string;
  imageId: string;
  imageW: number;
  imageH: number;
  skuFor: (size: string) => string;
}): Promise<{ id: string; skuMismatches: string[] }> {
  const { t } = opts;
  // Same printed width as the template; taller art is shrunk so it never runs past the print area.
  const maxH = Math.min(1.27 * t.placement.widthFrac * t.area.width, (0.98 - t.placement.topFrac) * t.area.height);
  let scale = t.placement.widthFrac;
  const hAt = (s: number) => s * t.area.width * (opts.imageH / opts.imageW);
  if (hAt(scale) > maxH) scale = (maxH / hAt(scale)) * scale;
  const y = t.placement.topFrac + hAt(scale) / 2 / t.area.height;

  const variants = t.variants.map((v) => ({ id: v.id, price: 2900, is_enabled: true, sku: opts.skuFor(v.size) }));
  const body = {
    title: opts.title,
    description: opts.description,
    blueprint_id: t.blueprintId,
    print_provider_id: t.providerId,
    variants,
    print_areas: [
      {
        variant_ids: t.variants.map((v) => v.id),
        placeholders: [{ position: "front", images: [{ id: opts.imageId, x: t.placement.x, y, scale, angle: t.placement.angle }] }],
      },
    ],
  };
  const created = await pf(`/shops/${t.shopId}/products.json`, { method: "POST", body: JSON.stringify(body) });

  // Make sure the variant SKUs are the CREEP- ones, so Shopify orders route to this product.
  const want = new Map(variants.map((v) => [v.id, v.sku]));
  let off = (created.variants || []).filter((v: any) => want.has(v.id) && v.sku !== want.get(v.id));
  if (off.length) {
    const updated = await pf(`/shops/${t.shopId}/products/${created.id}.json`, { method: "PUT", body: JSON.stringify({ variants }) });
    off = (updated.variants || []).filter((v: any) => want.has(v.id) && v.sku !== want.get(v.id));
  }
  return { id: created.id, skuMismatches: off.map((v: any) => `${v.title}: ${v.sku}`) };
}

export function printifyEditUrl(shop: number, productId: string) {
  return `https://printify.com/app/product-details/${productId}?shopId=${shop}`;
}
