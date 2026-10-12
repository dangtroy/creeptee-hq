import { getJson } from "./core";

// Write side of the Meta Marketing API for the New Ads action. Every ad is created PAUSED.
// Needs a System User token with ads_management + ads_read (META_ACCESS_TOKEN) and the Page (META_PAGE_ID).
const VERSION = process.env.META_API_VERSION || "v23.0";
const BASE = `https://graph.facebook.com/${VERSION}`;
const token = () => process.env.META_ACCESS_TOKEN || "";

export const adAccountId = () =>
  (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((s) => s.trim().replace(/^act_/, "")).filter(Boolean)[0] || "";
export const pageId = () => process.env.META_PAGE_ID || "885915364600485";

async function get(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params);
  return getJson(`${BASE}${path}?${qs}`, { headers: { Authorization: `Bearer ${token()}` } }, "Meta");
}

async function post(path: string, body: Record<string, unknown>) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.append(k, typeof v === "string" ? v : JSON.stringify(v));
  return getJson(`${BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form }, "Meta");
}

export type AdSet = { id: string; name: string; campaign: string; status: string };

/** Ad sets you can drop new ads into: active or paused, newest first. */
export async function listAdSets(): Promise<AdSet[]> {
  const r = await get(`/act_${adAccountId()}/adsets`, {
    fields: "id,name,effective_status,campaign{name}",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED"]),
    limit: "100",
  });
  return (r.data || []).map((a: any) => ({ id: a.id, name: a.name, campaign: a.campaign?.name || "", status: a.effective_status }));
}

export async function uploadImage(name: string, png: Buffer): Promise<string> {
  const r = await post(`/act_${adAccountId()}/adimages`, { name, bytes: png.toString("base64") });
  const img: any = Object.values(r.images || {})[0];
  if (!img?.hash) throw new Error("Meta didn't return an image hash");
  return img.hash;
}

export type AdInput = {
  name: string;
  adsetId: string;
  link: string;
  primaryText: string;
  headline: string;
  feedHash: string; // 4:5
  storyHash: string; // 9:16
};

/**
 * One placement-optimized image ad (_PLC): 9:16 in Stories/Reels, 4:5 everywhere else. If Meta
 * refuses the placement setup, falls back to a plain single-image ad with the 4:5 image.
 */
export async function createPausedAd(a: AdInput): Promise<{ id: string; creativeId: string; placement: boolean; note?: string }> {
  const acct = `/act_${adAccountId()}`;
  const page = pageId();
  let creative: any;
  let placement = true;
  let note: string | undefined;
  try {
    creative = await post(`${acct}/adcreatives`, {
      name: `${a.name} creative`,
      object_story_spec: { page_id: page },
      asset_feed_spec: {
        images: [
          { hash: a.feedHash, adlabels: [{ name: "feed" }] },
          { hash: a.storyHash, adlabels: [{ name: "story" }] },
        ],
        bodies: [{ text: a.primaryText }],
        titles: [{ text: a.headline }],
        link_urls: [{ website_url: a.link }],
        call_to_action_types: ["SHOP_NOW"],
        ad_formats: ["SINGLE_IMAGE"],
        optimization_type: "PLACEMENT",
        asset_customization_rules: [
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram"],
              facebook_positions: ["story", "facebook_reels"],
              instagram_positions: ["story", "reels"],
            },
            image_label: { name: "story" },
            priority: 1,
          },
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram", "audience_network", "messenger"],
            },
            image_label: { name: "feed" },
            priority: 2,
          },
        ],
      },
    });
  } catch (e) {
    placement = false;
    note = `Placement-optimized version was refused (${e instanceof Error ? e.message : e}); made a single 4:5 image ad instead.`;
    creative = await post(`${acct}/adcreatives`, {
      name: `${a.name} creative`,
      object_story_spec: {
        page_id: page,
        link_data: {
          image_hash: a.feedHash,
          link: a.link,
          message: a.primaryText,
          name: a.headline,
          call_to_action: { type: "SHOP_NOW", value: { link: a.link } },
        },
      },
    });
  }
  const ad = await post(`${acct}/ads`, {
    name: placement ? `${a.name}_PLC` : a.name,
    adset_id: a.adsetId,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });
  return { id: ad.id, creativeId: creative.id, placement, note };
}

export function adsManagerUrl(): string {
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${adAccountId()}`;
}
