# CREEPTEE HQ

Private dashboard for CREEPTEE: Shopify sales, Meta and TikTok ad performance, and Printify fulfillment in one page, plus **Actions** that do the work. Hosted on Vercel, behind a single password.

## How it works

- `app/page.tsx` renders the dashboard on the server. Each platform loads independently, so one failing or missing platform never blocks the rest.
- `lib/shopify.ts`, `lib/meta.ts`, `lib/tiktok.ts`, `lib/printify.ts` each talk to one platform's API. API keys live only in environment variables on the server; the browser never sees them.
- Results are cached for 5 minutes per server instance. The **Refresh** button skips the cache.
- `proxy.ts` sends anyone without the login cookie to `/login`.

## Actions

`/actions` lists every automation. Each one stops for your approval before it spends money or messages anyone.

### New product (`/actions/new-product`)

1. Pick the print file and type the design title. The browser uploads the file straight to Shopify (it's kept in Shopify → Files).
2. The app trims the transparent edges (the art itself is never changed), builds the catalog-standard mockup (`lib/mockup.ts`, blank tee in `lib/assets/`) and drafts the description, SEO, tags and alt text. You edit anything you like.
3. **Create** makes the Printify product first (saved, **never published**, CREEP- SKUs, blueprint/provider/print placement copied from the newest CREEPTEE Printify product), then the Shopify product as a **draft**: $29, SM–4XL, `CREEP-[DESIGN]-TEE-BLK-[SIZE]`, 9999 stock at the catalog's location, taxonomy + Google Shopping fields copied from the newest tee, added to New Arrivals.

It refuses to create a second product with the same handle or design SKU unless you tick "Create anyway".

## Environment variables

See `.env.example` for the full list. A platform with missing variables shows a "not connected" note naming exactly what to add.

| Platform | Variables | Where to get them |
| --- | --- | --- |
| Login | `APP_PASSWORD` | Make one up. Long and unique. |
| Shopify | `SHOPIFY_STORE_DOMAIN` + either `SHOPIFY_ACCESS_TOKEN`, or `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` | Shopify admin → Settings → Apps → Develop apps (or the Dev Dashboard). Scopes: `read_orders`, `read_products`; for Actions also `write_products`, `write_files`, `read_files`, `write_inventory`, `read_inventory`, `read_locations`. |
| Meta Ads | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_IDS` | Business Settings → Users → System users → Generate token with `ads_read`, and assign the ad accounts to that system user. |
| Printify | `PRINTIFY_API_TOKEN` | Printify → Account → Connections → Generate token. |
| Copywriter (optional) | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` | console.anthropic.com → API keys. Without it, New Product starts with blank copy. |
| TikTok Ads | `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_IDS` | business-api.tiktok.com → create a developer app with Reporting permission, then authorize your ad accounts. |

## Run on your computer

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Open http://localhost:3000.

## Deploy

Push to GitHub; Vercel builds every push to `main`. Change environment variables in Vercel → Project → Settings → Environment Variables, then redeploy.
