import { cached, getJson, lastDays, num, run } from "./core";

// TikTok Marketing API. Needs a long-term access token from a TikTok for Business developer app.
const BASE = "https://business-api.tiktok.com/open_api/v1.3";

export type TikTokAdvertiser = { id: string; spend: number; impressions: number; clicks: number; conversions: number; roas: number };

export function getTikTok(range: number, fresh: boolean) {
  return run(["TIKTOK_ACCESS_TOKEN", "TIKTOK_ADVERTISER_IDS"], () =>
    cached(`tiktok:${range}`, 5 * 60_000, fresh, async () => {
      const days = lastDays(range);
      const ids = (process.env.TIKTOK_ADVERTISER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
      return Promise.all(
        ids.map(async (id): Promise<TikTokAdvertiser> => {
          const qs = new URLSearchParams({
            advertiser_id: id,
            report_type: "BASIC",
            data_level: "AUCTION_ADVERTISER",
            dimensions: JSON.stringify(["advertiser_id"]),
            metrics: JSON.stringify(["spend", "impressions", "clicks", "conversion", "complete_payment_roas"]),
            start_date: days[0],
            end_date: days[days.length - 1],
          });
          const r = await getJson(`${BASE}/report/integrated/get/?${qs}`, { headers: { "Access-Token": process.env.TIKTOK_ACCESS_TOKEN! } }, "TikTok");
          if (r.code !== 0) throw new Error(`TikTok: ${r.message}`);
          const m = r.data?.list?.[0]?.metrics || {};
          return { id, spend: num(m.spend), impressions: num(m.impressions), clicks: num(m.clicks), conversions: num(m.conversion), roas: num(m.complete_payment_roas) };
        }),
      );
    }),
  );
}
