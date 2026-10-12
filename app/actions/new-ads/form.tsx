"use client";

import { useEffect, useState } from "react";

type Product = { id: string; title: string; handle: string; status: string; description: string; image: string | null; createdAt: string };
type AdSet = { id: string; name: string; campaign: string; status: string };
type Options = { products: Product[]; productsError: string | null; adsets: AdSet[]; adsetsError: string | null };
type Prepared = { product: Product; source: string; feedPreview: string; storyPreview: string; copy: { primaryText: string; headline: string; link: string } };
type Result = { adsetId: string; ok: boolean; id?: string; placement?: boolean; note?: string; error?: string };

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// The New Drop ad sets are the default home for new-product ads.
const isDefault = (a: AdSet) => /new drop/i.test(a.campaign) && /scenes/i.test(a.name);

export default function NewAdsForm() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [productId, setProductId] = useState("");
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [copy, setCopy] = useState<Prepared["copy"] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>("Loading products and ad sets…");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ results: Result[]; adsManager: string; warnings: string[] } | null>(null);

  useEffect(() => {
    post<Options>("/api/ads/options")
      .then((o) => {
        setOpts(o);
        setChosen(new Set(o.adsets.filter(isDefault).map((a) => a.id)));
        if (o.products[0]) setProductId(o.products[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(null));
  }, []);

  async function prepare() {
    setError(null);
    setBusy("Building the 4:5 and 9:16 images…");
    try {
      const p = await post<Prepared>("/api/ads/prepare", { productId });
      setPrep(p);
      setCopy(p.copy);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!prep || !copy) return;
    setError(null);
    setBusy("Uploading images and creating paused ads…");
    try {
      setDone(await post("/api/ads/create", { productId: prep.product.id, adsetIds: [...chosen], ...copy }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const adsetName = (id: string) => opts?.adsets.find((a) => a.id === id)?.name || id;

  if (done) {
    return (
      <section className="panel">
        <div className="ph">
          <h2>Ads created, paused</h2>
          <a className="btn primary" href={done.adsManager} target="_blank" rel="noreferrer">
            Open Ads Manager
          </a>
        </div>
        <div className="list">
          {done.results.map((r) => (
            <div key={r.adsetId} className="row">
              <div className="l">
                <b>{adsetName(r.adsetId)}</b>
                <span>{r.ok ? `Ad ${r.id} · ${r.placement ? "4:5 feed + 9:16 stories/reels" : "single 4:5 image"}` : r.error}</span>
              </div>
              <span className={`pill ${r.ok ? "ok" : "bad"}`}>{r.ok ? "Paused" : "Failed"}</span>
            </div>
          ))}
        </div>
        {done.results.filter((r) => r.note).map((r) => (
          <p key={r.adsetId} className="off">
            {r.note}
          </p>
        ))}
        {done.warnings.map((w) => (
          <p key={w} className="err">
            {w}
          </p>
        ))}
        <p className="note">Nothing is spending. Turn them on in Ads Manager when you&apos;re ready.</p>
        <div>
          <button className="btn" onClick={() => { setDone(null); setPrep(null); }}>
            Make more
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="panel np-fields">
        <label className="lbl" htmlFor="ad-product">
          Product
        </label>
        <select id="ad-product" value={productId} onChange={(e) => { setProductId(e.target.value); setPrep(null); }} disabled={!opts?.products.length}>
          {opts?.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} {p.status !== "ACTIVE" ? `(${p.status.toLowerCase()})` : ""}
            </option>
          ))}
        </select>
        {opts?.productsError && <p className="err">{opts.productsError}</p>}
        {!prep && (
          <div>
            <button className="btn primary" onClick={prepare} disabled={!!busy || !productId}>
              {busy || "Build ad images"}
            </button>
          </div>
        )}
        {error && !prep && <p className="err">{error}</p>}
      </section>

      {prep && copy && (
        <section className="panel">
          <div className="ph">
            <h2>Review</h2>
            <span className="meta">Images from the {prep.source}</span>
          </div>
          <div className="np-grid">
            <div className="ad-previews">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated preview */}
              <img className="np-mock" src={prep.feedPreview} alt={`${prep.product.title} 4:5 ad image`} />
              {/* eslint-disable-next-line @next/next/no-img-element -- generated preview */}
              <img className="np-mock" src={prep.storyPreview} alt={`${prep.product.title} 9:16 ad image`} />
            </div>
            <div className="np-fields">
              <label className="lbl" htmlFor="ad-text">
                Primary text
              </label>
              <textarea id="ad-text" rows={3} value={copy.primaryText} onChange={(e) => setCopy({ ...copy, primaryText: e.target.value })} />
              <label className="lbl" htmlFor="ad-head">
                Headline
              </label>
              <input id="ad-head" value={copy.headline} onChange={(e) => setCopy({ ...copy, headline: e.target.value })} />
              <label className="lbl" htmlFor="ad-link">
                Link
              </label>
              <input id="ad-link" value={copy.link} onChange={(e) => setCopy({ ...copy, link: e.target.value })} />

              <span className="lbl">Ad sets</span>
              {opts?.adsetsError ? (
                <p className="err">{opts.adsetsError}</p>
              ) : (
                <div className="adset-list">
                  {opts?.adsets.map((a) => (
                    <label key={a.id} className="np-check">
                      <input
                        type="checkbox"
                        checked={chosen.has(a.id)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(a.id);
                          else next.delete(a.id);
                          setChosen(next);
                        }}
                      />
                      <span>
                        {a.name} <span className="note">· {a.campaign}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {prep.product.status !== "ACTIVE" && <p className="off">This product is still a draft. The ads will be ready, but the link only works once it&apos;s Active.</p>}
              {error && <p className="err">{error}</p>}
              <div className="controls">
                <button className="btn primary" onClick={create} disabled={!!busy || !chosen.size}>
                  {busy || `Create ${chosen.size} paused ad${chosen.size === 1 ? "" : "s"}`}
                </button>
                <button className="btn" onClick={() => setPrep(null)} disabled={!!busy}>
                  Back
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
