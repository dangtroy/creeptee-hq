import { cached, getJson, num, run } from "./core";

// Printify API. Personal access token from Printify → Account → Connections.
const BASE = "https://api.printify.com/v1";
const auth = () => ({ headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_TOKEN}`, "User-Agent": "creeptee-hq" } });

export type PrintifyData = {
  shop: string;
  sampled: number;
  productCount: number;
  statusCounts: { status: string; count: number }[];
  orders: { id: string; label: string; status: string; createdAt: string; cost: number; items: number }[];
};

export function getPrintify(fresh: boolean) {
  return run(["PRINTIFY_API_TOKEN"], () =>
    cached("printify", 5 * 60_000, fresh, async (): Promise<PrintifyData> => {
      const shops: any[] = await getJson(`${BASE}/shops.json`, auth(), "Printify");
      const shop =
        shops.find((s) => String(s.id) === process.env.PRINTIFY_SHOP_ID) ||
        shops.find((s) => /shopify/i.test(s.sales_channel || "")) ||
        shops[0];
      if (!shop) throw new Error("Printify: no shops on this account");

      // Printify returns at most 10 orders per page; read 3 pages for a recent picture.
      const pages = await Promise.all(
        [1, 2, 3].map((p) => getJson(`${BASE}/shops/${shop.id}/orders.json?limit=10&page=${p}`, auth(), "Printify")),
      );
      const products = await getJson(`${BASE}/shops/${shop.id}/products.json?limit=1`, auth(), "Printify");
      const orders = pages.flatMap((p) => p.data || []);

      const counts = new Map<string, number>();
      for (const o of orders) counts.set(o.status, (counts.get(o.status) || 0) + 1);

      return {
        shop: shop.title,
        sampled: orders.length,
        productCount: num(products.total),
        statusCounts: [...counts].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
        orders: orders.slice(0, 12).map((o: any) => ({
          id: String(o.id),
          label: o.metadata?.shop_order_label || String(o.id).slice(-6),
          status: o.status,
          createdAt: o.created_at,
          // Printify amounts are in cents.
          cost: (num(o.total_price) + num(o.total_shipping) + num(o.total_tax)) / 100,
          items: (o.line_items || []).reduce((a: number, l: any) => a + num(l.quantity), 0),
        })),
      };
    }),
  );
}
