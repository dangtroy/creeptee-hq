import { cached, getJson, num, run } from "./core";

// Meta Marketing API. Needs a System User token with ads_read, plus the ad account IDs (numbers only).
const VERSION = process.env.META_API_VERSION || "v23.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

const presetFor = (range: number) => ({ 7: "last_7d", 14: "last_14d", 30: "last_30d" } as Record<number, string>)[range] || "last_7d";
const auth = () => ({ headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } });

type Action = { action_type: string; value: string };
const pick = (list: Action[] | undefined, types: string[]) => {
  for (const t of types) {
    const hit = list?.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
};
const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

export type MetaCampaign = { id: string; name: string; status: string; spend: number; roas: number; purchases: number; cpa: number; ctr: number };
export type MetaAccount = { id: string; name: string; currency: string; spend: number; roas: number; purchases: number; campaigns: MetaCampaign[] };

async function account(id: string, range: number): Promise<MetaAccount> {
  const preset = presetFor(range);
  const fields = "campaign_id,campaign_name,spend,purchase_roas,actions,cost_per_action_type,ctr";
  const [info, totals, camps, statuses] = await Promise.all([
    getJson(`${BASE}/act_${id}?fields=name,currency`, auth(), "Meta"),
    getJson(`${BASE}/act_${id}/insights?level=account&date_preset=${preset}&fields=spend,purchase_roas,actions`, auth(), "Meta"),
    getJson(`${BASE}/act_${id}/insights?level=campaign&date_preset=${preset}&fields=${fields}&limit=100`, auth(), "Meta"),
    getJson(`${BASE}/act_${id}/campaigns?fields=id,effective_status&limit=200`, auth(), "Meta"),
  ]);
  const status = new Map<string, string>((statuses.data || []).map((c: any) => [c.id, c.effective_status]));
  const t = totals.data?.[0] || {};
  return {
    id,
    name: info.name || id,
    currency: info.currency || "USD",
    spend: num(t.spend),
    roas: pick(t.purchase_roas, PURCHASE),
    purchases: pick(t.actions, PURCHASE),
    campaigns: (camps.data || [])
      .map((c: any) => ({
        id: c.campaign_id,
        name: c.campaign_name,
        status: status.get(c.campaign_id) || "UNKNOWN",
        spend: num(c.spend),
        roas: pick(c.purchase_roas, PURCHASE),
        purchases: pick(c.actions, PURCHASE),
        cpa: pick(c.cost_per_action_type, PURCHASE),
        ctr: num(c.ctr),
      }))
      .sort((a: MetaCampaign, b: MetaCampaign) => b.spend - a.spend),
  };
}

export function getMeta(range: number, fresh: boolean) {
  return run(["META_ACCESS_TOKEN", "META_AD_ACCOUNT_IDS"], () =>
    cached(`meta:${range}`, 5 * 60_000, fresh, async () => {
      const ids = (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((s) => s.trim().replace(/^act_/, "")).filter(Boolean);
      return Promise.all(ids.map((id) => account(id, range)));
    }),
  );
}
