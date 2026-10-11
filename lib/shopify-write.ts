import { gql } from "./shopify";

// Write side of Shopify for the New Product action.
// Needs Admin API scopes: write_products, write_files, write_inventory, read_locations (plus the existing read scopes).

export const SIZES = ["SM", "MD", "LG", "XL", "2XL", "3XL", "4XL"] as const;
export const PRICE = "29.00";

/** "Things Are Happening Raccoon" → "THINGSAREHAPPENINGRACCOON" (the [DESIGN] SKU segment). */
export function designKey(title: string): string {
  return title
    .replace(/\btee\b\s*$/i, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

export const skuFor = (design: string, size: string) => `CREEP-${design}-TEE-BLK-${size}`;

export function handleFor(title: string): string {
  const base = title.trim().replace(/\s+tee$/i, "");
  return `${base} tee`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------- staged uploads ----------

type StagedTarget = { url: string; resourceUrl: string; parameters: { name: string; value: string }[] };

export async function stageUpload(filename: string, mimeType: string, fileSize: number): Promise<StagedTarget> {
  const d = await gql(
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    { input: [{ filename, mimeType, resource: "IMAGE", httpMethod: "POST", fileSize: String(fileSize) }] },
  );
  const r = d.stagedUploadsCreate;
  if (r.userErrors.length) throw new Error("Shopify upload: " + r.userErrors.map((e: any) => e.message).join("; "));
  return r.stagedTargets[0];
}

/** Server-side upload of a generated file (the mockup) to a staged target. Returns the resourceUrl. */
export async function uploadBuffer(filename: string, mimeType: string, buf: Buffer): Promise<string> {
  const t = await stageUpload(filename, mimeType, buf.length);
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([new Uint8Array(buf)], { type: mimeType }), filename);
  const res = await fetch(t.url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Shopify upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return t.resourceUrl;
}

/** Turns an uploaded staged file into a Shopify Files image and waits until its CDN URL is ready. */
export async function createFileAndWait(resourceUrl: string, alt: string): Promise<{ id: string; url: string; width: number; height: number }> {
  const d = await gql(
    `mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { id } userErrors { field message } }
    }`,
    { files: [{ originalSource: resourceUrl, contentType: "IMAGE", alt }] },
  );
  const r = d.fileCreate;
  if (r.userErrors.length) throw new Error("Shopify file: " + r.userErrors.map((e: any) => e.message).join("; "));
  const id: string = r.files[0].id;

  for (let i = 0; i < 40; i++) {
    await new Promise((ok) => setTimeout(ok, 1500));
    const q = await gql(
      `query($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus fileErrors { message } image { url width height } } } }`,
      { id },
    );
    const n = q.node;
    if (n?.fileStatus === "READY" && n.image?.url) return { id, url: n.image.url, width: n.image.width, height: n.image.height };
    if (n?.fileStatus === "FAILED") throw new Error("Shopify couldn't process the image: " + (n.fileErrors?.[0]?.message || "unknown error"));
  }
  throw new Error("Shopify is still processing the image. Try again in a minute.");
}

// ---------- template + checks ----------

export type ShopifyTemplate = {
  productType: string;
  vendor: string;
  category: string | null;
  weight: { value: number; unit: string } | null;
  locationId: string;
  metafields: { namespace: string; key: string; type: string; value: string }[];
  collections: { id: string; title: string }[];
};

// Taxonomy + Google Shopping metafields are the same for every CREEPTEE tee, so they're copied from the newest one.
const COPY_NAMESPACES = ["shopify", "mm-google-shopping"];
const DEFAULT_COLLECTIONS = ["new arrivals", "t-shirts"];

export async function shopifyTemplate(): Promise<ShopifyTemplate> {
  const d = await gql(
    `query {
      products(first: 1, query: "sku:CREEP-*", sortKey: CREATED_AT, reverse: true) {
        nodes {
          productType vendor category { id }
          metafields(first: 40) { nodes { namespace key type value } }
          variants(first: 1) { nodes { inventoryItem { measurement { weight { value unit } } inventoryLevels(first: 1) { nodes { location { id } } } } } }
        }
      }
      collections(first: 100) { nodes { id title ruleSet { appliedDisjunctively } } }
      locations(first: 1) { nodes { id } }
    }`,
    {},
  );
  const p = d.products.nodes[0];
  const v = p?.variants.nodes[0]?.inventoryItem;
  const locationId = v?.inventoryLevels.nodes[0]?.location.id || d.locations.nodes[0]?.id;
  if (!locationId) throw new Error("Shopify: no inventory location found");
  return {
    productType: p?.productType || "T-Shirt",
    vendor: p?.vendor || "CREEPTEE",
    category: p?.category?.id || null,
    weight: v?.measurement?.weight || null,
    locationId,
    metafields: (p?.metafields.nodes || []).filter((m: any) => COPY_NAMESPACES.includes(m.namespace)),
    // Manual collections only (smart collections fill themselves from tags).
    collections: d.collections.nodes.filter((c: any) => !c.ruleSet && DEFAULT_COLLECTIONS.includes(c.title.toLowerCase())),
  };
}

/** Existing products that already use this handle or design SKU, so a drop is never created twice. */
export async function findClashes(handle: string, design: string): Promise<{ title: string; id: string }[]> {
  const d = await gql(
    `query($q: String!) { products(first: 5, query: $q) { nodes { id title } } }`,
    { q: `handle:${handle} OR sku:CREEP-${design}-*` },
  );
  return d.products.nodes;
}

// ---------- create ----------

export type NewProduct = {
  title: string;
  handle: string;
  design: string;
  descriptionHtml: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  mockupResourceUrl: string;
  mockupAlt: string;
};

export async function createDraftProduct(p: NewProduct, t: ShopifyTemplate): Promise<{ id: string; handle: string; note?: string }> {
  try {
    return await productSet(p, t, t.locationId);
  } catch (e) {
    // If the catalog's stock location (Printify's fulfillment location) won't take stock from this app,
    // fall back to the store's own location so the draft still gets made.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/location|inventory/i.test(msg)) throw e;
    const d = await gql(`query { locations(first: 10) { nodes { id name fulfillmentService { id } } } }`, {});
    const own = d.locations.nodes.find((l: any) => !l.fulfillmentService && l.id !== t.locationId);
    if (!own) throw e;
    const r = await productSet(p, t, own.id);
    return { ...r, note: `Stock was set at "${own.name}" instead of the Printify location (${msg}). Move it in Shopify if orders should route to Printify.` };
  }
}

async function productSet(p: NewProduct, t: ShopifyTemplate, locationId: string): Promise<{ id: string; handle: string }> {
  const d = await gql(
    `mutation($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: p.title,
        handle: p.handle,
        descriptionHtml: p.descriptionHtml,
        vendor: t.vendor,
        productType: t.productType,
        ...(t.category ? { category: t.category } : {}),
        status: "DRAFT",
        tags: p.tags,
        seo: { title: p.seoTitle, description: p.seoDescription },
        metafields: t.metafields,
        collections: t.collections.map((c) => c.id),
        files: [{ originalSource: p.mockupResourceUrl, contentType: "IMAGE", alt: p.mockupAlt }],
        productOptions: [{ name: "Size", values: SIZES.map((name) => ({ name })) }],
        variants: SIZES.map((size, i) => ({
          position: i + 1,
          optionValues: [{ optionName: "Size", name: size }],
          sku: skuFor(p.design, size),
          price: PRICE,
          taxable: true,
          inventoryPolicy: "DENY",
          inventoryItem: {
            tracked: true,
            requiresShipping: true,
            ...(t.weight ? { measurement: { weight: t.weight } } : {}),
          },
          inventoryQuantities: [{ locationId, name: "available", quantity: 9999 }],
        })),
      },
    },
  );
  const r = d.productSet;
  if (r.userErrors.length) throw new Error("Shopify: " + r.userErrors.map((e: any) => `${(e.field || []).join(".")} ${e.message}`).join("; "));
  return r.product;
}

export function adminUrl(gid: string): string {
  const store = (process.env.SHOPIFY_STORE_DOMAIN || "").replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${store}/products/${gid.split("/").pop()}`;
}
