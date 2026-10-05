import { RANGES, type Range, type Source } from "@/lib/core";
import { getMeta } from "@/lib/meta";
import { getPrintify } from "@/lib/printify";
import { getShopify } from "@/lib/shopify";
import { getTikTok } from "@/lib/tiktok";
import { Delta, SalesChart, SourceGate, pretty, usd } from "./components";

export default async function Home({ searchParams }: { searchParams: Promise<{ days?: string; fresh?: string }> }) {
  const sp = await searchParams;
  const days: Range = (RANGES as readonly number[]).includes(Number(sp.days)) ? (Number(sp.days) as Range) : 7;
  const fresh = sp.fresh === "1";

  const [shop, meta, tiktok, printify] = await Promise.all([
    getShopify(days, fresh),
    getMeta(days, fresh),
    getTikTok(days, fresh),
    getPrintify(fresh),
  ]);

  // Top-line numbers
  const s = shop.state === "ok" ? shop.data : null;
  const rev = s ? s.days.reduce((a, d) => a + d.sales, 0) : 0;
  const prevRev = s ? s.prev.reduce((a, d) => a + d.sales, 0) : 0;
  const ord = s ? s.days.reduce((a, d) => a + d.orders, 0) : 0;
  const prevOrd = s ? s.prev.reduce((a, d) => a + d.orders, 0) : 0;
  const metaSpend = meta.state === "ok" ? meta.data.reduce((a, m) => a + m.spend, 0) : 0;
  const metaRoas = meta.state === "ok" && metaSpend ? meta.data.reduce((a, m) => a + m.roas * m.spend, 0) / metaSpend : 0;
  const ttSpend = tiktok.state === "ok" ? tiktok.data.reduce((a, t) => a + t.spend, 0) : 0;
  const spend = metaSpend + ttSpend;
  const mer = s && spend ? rev / spend : 0;
  const hasSpend = meta.state === "ok" || tiktok.state === "ok";

  const sources: [string, Source<unknown>][] = [
    ["Shopify", shop],
    ["Meta Ads", meta],
    ["TikTok Ads", tiktok],
    ["Printify", printify],
  ];

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>
            CREEPTEE <b>HQ</b>
          </h1>
          <span className="sub">Updated {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.STORE_TIMEZONE || "America/Los_Angeles" })}</span>
        </div>
        <div className="controls">
          <nav className="seg" aria-label="Date range">
            {RANGES.map((r) => (
              <a key={r} href={`/?days=${r}`} aria-current={r === days}>
                {r} days
              </a>
            ))}
          </nav>
          <a className="btn" href={`/?days=${days}&fresh=1`}>
            Refresh
          </a>
          <form method="post" action="/api/logout">
            <button className="btn" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="kpis" aria-label="Key numbers">
        <div className="kpi">
          <span className="lbl">Revenue</span>
          <span className="v">{s ? usd(rev) : "—"}</span>
          <span className="d">{s ? <Delta cur={rev} prev={prevRev} days={days} /> : "Shopify not connected"}</span>
        </div>
        <div className="kpi">
          <span className="lbl">Orders</span>
          <span className="v">{s ? ord.toLocaleString() : "—"}</span>
          <span className="d">{s ? <Delta cur={ord} prev={prevOrd} days={days} /> : <>&nbsp;</>}</span>
        </div>
        <div className="kpi">
          <span className="lbl">Avg order</span>
          <span className="v">{s && ord ? usd(rev / ord, 2) : "—"}</span>
          <span className="d">{s && ord && prevOrd ? <Delta cur={rev / ord} prev={prevRev / prevOrd} days={days} /> : <>&nbsp;</>}</span>
        </div>
        <div className="kpi">
          <span className="lbl">Ad spend</span>
          <span className="v">{hasSpend ? usd(spend) : "—"}</span>
          <span className="d">
            Meta {meta.state === "ok" ? usd(metaSpend) : "—"} · TikTok {tiktok.state === "ok" ? usd(ttSpend) : "—"}
          </span>
        </div>
        <div className="kpi">
          <span className="lbl">MER</span>
          <span className={`v ${mer >= 2 ? "up" : mer && mer < 1.2 ? "down" : ""}`}>{mer ? mer.toFixed(2) : "—"}</span>
          <span className="d">Revenue ÷ ad spend</span>
        </div>
        <div className="kpi">
          <span className="lbl">Meta ROAS</span>
          <span className={`v ${metaRoas >= 2 ? "up" : metaRoas && metaRoas < 1 ? "down" : ""}`}>{metaRoas ? metaRoas.toFixed(2) : "—"}</span>
          <span className="d">As Meta reports it</span>
        </div>
      </section>

      <div className="main">
        <div className="col">
          <section className="panel">
            <div className="ph">
              <h2>Sales by day</h2>
            </div>
            <SourceGate src={shop} name="Shopify">
              {(d) => (
                <>
                  <div className="legend">
                    <span>
                      <i style={{ background: "var(--accent)" }} />
                      This period
                    </span>
                    <span>
                      <i style={{ background: "var(--prev)" }} />
                      Previous period
                    </span>
                  </div>
                  <div className="chart">
                    <SalesChart cur={d.days} prev={d.prev} />
                  </div>
                </>
              )}
            </SourceGate>
          </section>

          <section className="panel">
            <div className="ph">
              <h2>Meta campaigns</h2>
              <span className="meta">Full days only; today isn&apos;t included</span>
            </div>
            <SourceGate src={meta} name="Meta Ads">
              {(accounts) =>
                accounts.map((a) => {
                  const rows = a.campaigns.filter((c) => c.spend > 0 || c.status === "ACTIVE");
                  return (
                    <div key={a.id} style={{ display: "grid", gap: 8 }}>
                      <div className="ph">
                        <span className="lbl">{a.name}</span>
                        <span className="meta num">
                          {usd(a.spend)} spent · ROAS {a.roas ? a.roas.toFixed(2) : "—"} · {a.purchases} purchases
                        </span>
                      </div>
                      {rows.length ? (
                        <div className="tbl">
                          <table>
                            <thead>
                              <tr>
                                <th>Campaign</th>
                                <th>Status</th>
                                <th className="r">Spend</th>
                                <th className="r">Purchases</th>
                                <th className="r">Cost / purchase</th>
                                <th className="r">ROAS</th>
                                <th className="r">CTR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((c) => (
                                <tr key={c.id}>
                                  <td className="name" title={c.name}>
                                    {c.name}
                                  </td>
                                  <td>
                                    <span className={`pill ${c.status === "ACTIVE" ? "ok" : /DISAPPROVED|WITH_ISSUES|PENDING_BILLING/.test(c.status) ? "bad" : ""}`}>{pretty(c.status)}</span>
                                  </td>
                                  <td className="r num">{usd(c.spend)}</td>
                                  <td className="r num">{c.purchases}</td>
                                  <td className="r num">{c.cpa ? usd(c.cpa, 2) : "—"}</td>
                                  <td className={`r num ${c.roas >= 2 ? "up" : c.roas && c.roas < 1 ? "down" : ""}`} style={{ fontWeight: 600 }}>
                                    {c.roas ? c.roas.toFixed(2) : "—"}
                                  </td>
                                  <td className="r num">{c.ctr ? c.ctr.toFixed(2) + "%" : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="note">No spend in this period.</p>
                      )}
                    </div>
                  );
                })
              }
            </SourceGate>
          </section>

          <div className="pair">
            <section className="panel">
              <div className="ph">
                <h2>Top sellers</h2>
                <span className="meta">Product sales</span>
              </div>
              <SourceGate src={shop} name="Shopify">
                {(d) => {
                  const max = Math.max(1, ...d.topProducts.map((p) => p.sales));
                  return d.topProducts.length ? (
                    <div className="list">
                      {d.topProducts.map((p) => (
                        <div key={p.title} className="row" style={{ display: "grid", gap: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, minWidth: 0 }}>
                            <b style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</b>
                            <span className="num">{usd(p.sales)}</span>
                          </div>
                          <span className="note">{p.units} sold</span>
                          <div className="bar">
                            <i style={{ width: `${((p.sales / max) * 100).toFixed(1)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="note">No sales in this period.</p>
                  );
                }}
              </SourceGate>
            </section>

            <section className="panel">
              <div className="ph">
                <h2>TikTok ads</h2>
              </div>
              <SourceGate src={tiktok} name="TikTok Ads">
                {(list) => (
                  <div className="list">
                    {list.map((t) => (
                      <div key={t.id} className="row">
                        <div className="l">
                          <b className="num">{t.id}</b>
                          <span>
                            {t.impressions.toLocaleString()} impressions · {t.clicks.toLocaleString()} clicks · {t.conversions} conversions
                          </span>
                        </div>
                        <div className="num r">
                          {usd(t.spend, 2)}
                          <div className="note">ROAS {t.roas ? t.roas.toFixed(2) : "—"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SourceGate>
            </section>
          </div>

          <section className="panel">
            <div className="ph">
              <h2>Latest orders</h2>
            </div>
            <SourceGate src={shop} name="Shopify">
              {(d) => (
                <div className="tbl">
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Placed</th>
                        <th className="r">Items</th>
                        <th>Payment</th>
                        <th>Fulfillment</th>
                        <th className="r">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.latest.map((o) => (
                        <tr key={o.name}>
                          <td className="num">{o.name}</td>
                          <td>{new Date(o.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: process.env.STORE_TIMEZONE || "America/Los_Angeles" })}</td>
                          <td className="r num">{o.items}</td>
                          <td>
                            <span className={`pill ${o.financial === "PAID" ? "ok" : /REFUND|VOID/.test(o.financial) ? "bad" : "mid"}`}>{pretty(o.financial)}</span>
                          </td>
                          <td>
                            <span className={`pill ${o.fulfillment === "FULFILLED" ? "ok" : o.fulfillment === "UNFULFILLED" ? "mid" : ""}`}>{pretty(o.fulfillment)}</span>
                          </td>
                          <td className="r num">{usd(o.total, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SourceGate>
          </section>
        </div>

        <aside className="col">
          <section className="panel">
            <div className="ph">
              <h2>Printify</h2>
              {printify.state === "ok" && <span className="meta">{printify.data.productCount} products</span>}
            </div>
            <SourceGate src={printify} name="Printify">
              {(p) => (
                <>
                  <div className="chips">
                    {p.statusCounts.map((c) => (
                      <span key={c.status} className={`pill ${/fulfilled|delivered/.test(c.status) ? "ok" : /hold|cancel|fail/.test(c.status) ? "bad" : "mid"}`}>
                        {c.count} {pretty(c.status)}
                      </span>
                    ))}
                  </div>
                  <p className="note">Status of the last {p.sampled} orders sent to {p.shop}.</p>
                  <div className="list">
                    {p.orders.map((o) => (
                      <div key={o.id} className="row">
                        <div className="l">
                          <b className="num">{o.label}</b>
                          <span>
                            {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {o.items} items · cost {usd(o.cost, 2)}
                          </span>
                        </div>
                        <span className={`pill ${/fulfilled|delivered/.test(o.status) ? "ok" : /hold|cancel|fail/.test(o.status) ? "bad" : "mid"}`}>{pretty(o.status)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SourceGate>
          </section>

          <section className="panel">
            <div className="ph">
              <h2>Connections</h2>
            </div>
            <div className="list">
              {sources.map(([name, src]) => (
                <div key={name} className="row">
                  <span>{name}</span>
                  <span className={`pill ${src.state === "ok" ? "ok" : src.state === "error" ? "bad" : ""}`}>
                    {src.state === "ok" ? "Connected" : src.state === "error" ? "Error" : "Not set up"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
