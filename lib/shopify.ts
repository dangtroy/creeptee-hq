import { cached, dayKey, getJson, lastDays, num, run } from "./core";

// Auth: either a static Admin API token (SHOPIFY_ACCESS_TOKEN, starts with shpat_)
// or a Dev Dashboard app's client ID + secret, exchanged for a short-lived token.
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";
let tokenCache: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SHOPIFY_CLIENT_ID || "",
    client_secret: process.env.SHOPIFY_CLIENT_SECRET || "",
  });
  const r = await getJson(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
    "Shopify token",
  );
  tokenCache = { token: r.access_token, exp: Date.now() + Math.max(60, (r.expires_in ?? 3600) - 300) * 1000 };
  return tokenCache.token;
}

async function gql(query: string, variables: Record<string, unknown>) {
  const r = await getJson(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await token() },
      body: JSON.stringify({ query, variables }),
    },
    "Shopify",
  );
  if (r.errors?.length) throw new Error("Shopify: " + r.errors.map((e: any) => e.message).join("; "));
  return r.data;
}

const ORDERS = `query($q: String!, $after: String) {
  orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 10) { nodes { title quantity originalTotalSet { shopMoney { amount } } } }
    }
  }
}`;

type Order = {
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  lineItems: { nodes: { title: string; quantity: number; originalTotalSet: { shopMoney: { amount: string } } }[] };
};

export type ShopifyData = {
  currency: string;
  days: { day: string; sales: number; orders: number }[];
  prev: { day: string; sales: number; orders: number }[];
  topProducts: { title: string; sales: number; units: number }[];
  latest: { name: string; createdAt: string; total: number; financial: string; fulfillment: string; items: number }[];
};

async function fetchOrders(sinceDay: string): Promise<Order[]> {
  const all: Order[] = [];
  let after: string | null = null;
  // Cap at 20 pages (1,000 orders) to keep the page fast.
  for (let i = 0; i < 20; i++) {
    const d: any = await gql(ORDERS, { q: `created_at:>=${sinceDay}`, after });
    all.push(...d.orders.nodes);
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  return all;
}

export function getShopify(range: number, fresh: boolean) {
  return run(["SHOPIFY_STORE_DOMAIN", process.env.SHOPIFY_ACCESS_TOKEN ? "SHOPIFY_ACCESS_TOKEN" : "SHOPIFY_CLIENT_ID", ...(process.env.SHOPIFY_ACCESS_TOKEN ? [] : ["SHOPIFY_CLIENT_SECRET"])], () =>
    cached(`shopify:${range}`, 5 * 60_000, fresh, async (): Promise<ShopifyData> => {
      const cur = lastDays(range);
      const prev = lastDays(range, range);
      // One extra day of margin for timezone differences; bucketing below uses store-timezone days.
      const orders = await fetchOrders(lastDays(1, 2 * range)[0]);
      const live = orders.filter((o) => !o.cancelledAt);

      const bucket = (keys: string[]) => {
        const m = new Map(keys.map((k) => [k, { day: k, sales: 0, orders: 0 }]));
        for (const o of live) {
          const b = m.get(dayKey(new Date(o.createdAt)));
          if (b) {
            b.sales += num(o.currentTotalPriceSet.shopMoney.amount);
            b.orders += 1;
          }
        }
        return [...m.values()];
      };

      const curSet = new Set(cur);
      const prod = new Map<string, { title: string; sales: number; units: number }>();
      for (const o of live) {
        if (!curSet.has(dayKey(new Date(o.createdAt)))) continue;
        for (const li of o.lineItems.nodes) {
          const p = prod.get(li.title) || { title: li.title, sales: 0, units: 0 };
          p.sales += num(li.originalTotalSet.shopMoney.amount);
          p.units += li.quantity;
          prod.set(li.title, p);
        }
      }

      return {
        currency: orders[0]?.currentTotalPriceSet.shopMoney.currencyCode || "USD",
        days: bucket(cur),
        prev: bucket(prev),
        topProducts: [...prod.values()].sort((a, b) => b.sales - a.sales).slice(0, 8),
        latest: orders.slice(0, 10).map((o) => ({
          name: o.name,
          createdAt: o.createdAt,
          total: num(o.currentTotalPriceSet.shopMoney.amount),
          financial: o.displayFinancialStatus,
          fulfillment: o.displayFulfillmentStatus,
          items: o.lineItems.nodes.reduce((a, l) => a + l.quantity, 0),
        })),
      };
    }),
  );
}
