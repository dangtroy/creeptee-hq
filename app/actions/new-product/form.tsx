"use client";

import { useState } from "react";

type Copy = { description: string; seoTitle: string; seoDescription: string; tags: string[]; alt: string };
type Prepared = {
  title: string;
  handle: string;
  design: string;
  skuExample: string;
  artUrl: string;
  artSize: { width: number; height: number };
  mockupResourceUrl: string;
  mockupPreview: string;
  copy: Copy;
  aiCopy: boolean;
  clashes: { id: string; title: string }[];
  warnings: string[];
};
type Created = {
  design: string;
  printify: { id: string; url: string; template: string };
  shopify: { id: string; handle: string; admin: string };
  collections: string[];
  warnings: string[];
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data });
  return data;
}

export default function NewProductForm() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [tags, setTags] = useState("");
  const [allowDup, setAllowDup] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [partial, setPartial] = useState<{ id: string; url: string } | null>(null);

  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setError(null);
    try {
      setBusy("Uploading the print file…");
      const target = await post<{ url: string; resourceUrl: string; parameters: { name: string; value: string }[] }>("/api/new-product/stage", {
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      });
      const form = new FormData();
      target.parameters.forEach((p) => form.append(p.name, p.value));
      form.append("file", file);
      const up = await fetch(target.url, { method: "POST", body: form });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);

      setBusy("Building the mockup and drafting copy… (about 20 seconds)");
      const p = await post<Prepared>("/api/new-product/prepare", { resourceUrl: target.resourceUrl, title });
      setPrep(p);
      setCopy(p.copy);
      setTags(p.copy.tags.join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!prep || !copy) return;
    setError(null);
    setPartial(null);
    setBusy("Creating the Printify product, then the Shopify draft…");
    try {
      const r = await post<Created>("/api/new-product/create", {
        title: prep.title,
        artUrl: prep.artUrl,
        mockupResourceUrl: prep.mockupResourceUrl,
        ...copy,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        allowDuplicate: allowDup,
      });
      setCreated(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      const pf = (err as { data?: { printify?: { id: string; url: string } } }).data?.printify;
      if (pf) setPartial(pf);
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setTitle("");
    setFile(null);
    setPrep(null);
    setCopy(null);
    setTags("");
    setAllowDup(false);
    setCreated(null);
    setPartial(null);
    setError(null);
  }

  if (created && prep) {
    return (
      <section className="panel">
        <div className="ph">
          <h2>{prep.title} is in</h2>
          <span className="pill ok">Draft</span>
        </div>
        <div className="np-grid">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated preview */}
          <img className="np-mock" src={prep.mockupPreview} alt={copy?.alt || prep.title} />
          <div className="list">
            <div className="row">
              <div className="l">
                <b>Shopify draft</b>
                <span>
                  {created.shopify.handle} · $29 · SM–4XL · CREEP-{created.design}-TEE-BLK-*
                  {created.collections.length ? ` · added to ${created.collections.join(", ")}` : ""}
                </span>
              </div>
              <a className="btn" href={created.shopify.admin} target="_blank" rel="noreferrer">
                Open
              </a>
            </div>
            <div className="row">
              <div className="l">
                <b>Printify product</b>
                <span>Saved, not published. Settings copied from {created.printify.template}.</span>
              </div>
              <a className="btn" href={created.printify.url} target="_blank" rel="noreferrer">
                Open
              </a>
            </div>
            {created.warnings.map((w) => (
              <p key={w} className="err">
                {w}
              </p>
            ))}
            <p className="note">Check the print placement in Printify, then set the Shopify product to Active when you&apos;re ready to drop it.</p>
            <div>
              <button className="btn primary" onClick={reset}>
                Add another
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (prep && copy) {
    const set = (k: keyof Copy) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCopy({ ...copy, [k]: e.target.value });
    return (
      <section className="panel">
        <div className="ph">
          <h2>Review</h2>
          <span className="meta">
            {prep.artSize.width}×{prep.artSize.height}px art · SKU {prep.skuExample}
          </span>
        </div>
        <div className="np-grid">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated preview */}
          <img className="np-mock" src={prep.mockupPreview} alt={copy.alt} />
          <div className="np-fields">
            <label className="lbl" htmlFor="np-desc">
              Description {prep.aiCopy && <span className="pill">drafted</span>}
            </label>
            <textarea id="np-desc" rows={3} value={copy.description} onChange={set("description")} />
            <label className="lbl" htmlFor="np-seot">
              SEO title
            </label>
            <input id="np-seot" value={copy.seoTitle} onChange={set("seoTitle")} />
            <label className="lbl" htmlFor="np-seod">
              SEO description <span className="num">{copy.seoDescription.length}/155</span>
            </label>
            <textarea id="np-seod" rows={3} value={copy.seoDescription} onChange={set("seoDescription")} />
            <label className="lbl" htmlFor="np-tags">
              Tags, comma separated
            </label>
            <input id="np-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            <label className="lbl" htmlFor="np-alt">
              Image alt text
            </label>
            <input id="np-alt" value={copy.alt} onChange={set("alt")} />

            {prep.warnings.map((w) => (
              <p key={w} className="off">
                {w}
              </p>
            ))}
            {prep.clashes.length > 0 && (
              <div className="err">
                Already in Shopify: {prep.clashes.map((c) => c.title).join(", ")}.
                <label className="np-check">
                  <input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} /> Create anyway
                </label>
              </div>
            )}
            {error && <p className="err">{error}</p>}
            {partial && (
              <p className="err">
                The Printify product was created before the error.{" "}
                <a href={partial.url} target="_blank" rel="noreferrer">
                  Open it in Printify
                </a>{" "}
                and delete it before retrying, or it&apos;ll be there twice.
              </p>
            )}
            <div className="controls">
              <button className="btn primary" onClick={create} disabled={!!busy || (prep.clashes.length > 0 && !allowDup)}>
                {busy || "Create Printify product + Shopify draft"}
              </button>
              <button className="btn" onClick={reset} disabled={!!busy}>
                Start over
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form className="panel np-fields" onSubmit={prepare}>
      <label className="lbl" htmlFor="np-title">
        Design title
      </label>
      <input id="np-title" placeholder="Things Are Happening Raccoon" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <label className="lbl" htmlFor="np-file">
        Print file (the 5000px &ldquo;Final&rdquo; PNG, transparent background, up to 20 MB)
      </label>
      <input id="np-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
      <p className="note">
        Nothing is created yet. Next you&apos;ll see the mockup and the copy, and can edit both before anything goes to Printify or Shopify.
      </p>
      {error && <p className="err">{error}</p>}
      <div>
        <button className="btn primary" type="submit" disabled={!!busy || !file || !title.trim()}>
          {busy || "Build mockup"}
        </button>
      </div>
    </form>
  );
}
