import Link from "next/link";
import { Brand } from "../components";

export const metadata = { title: "Actions · CREEPTEE HQ" };

// Every automation lives here. Each one stops for your approval before it spends money or messages anyone.
const ACTIONS: { name: string; blurb: string; href?: string }[] = [
  { name: "New product", blurb: "Art in → mockup, copy, Printify product and Shopify draft.", href: "/actions/new-product" },
  { name: "Drop fan-out", blurb: "Collection, email/SMS, IG post, ManyChat keyword and paused ads for a new drop." },
  { name: "Ads from new products", blurb: "Paused Meta and TikTok ads built from a new product's creative." },
  { name: "Ad check", blurb: "Daily read on Meta and TikTok with pause, scale and refresh calls." },
  { name: "Ad research", blurb: "Top category ads from Meta Ad Library, turned into creative tests." },
  { name: "Creator outreach", blurb: "Daily Trybe messages, drafted for approval." },
  { name: "Creator discovery", blurb: "A daily shortlist of TikTok and Instagram creators to approve." },
  { name: "Creator content → ads", blurb: "Approved Trybe videos queued as ads and on-site UGC." },
  { name: "Customer service", blurb: "Replies drafted for the support inbox." },
  { name: "Trend briefs", blurb: "Trending phrases and memes turned into design briefs for Eduardo." },
];

export default function Actions() {
  return (
    <div className="wrap narrow">
      <header className="top">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Brand />
        </Link>
        <nav className="controls">
          <Link className="btn" href="/">
            Dashboard
          </Link>
        </nav>
      </header>
      <h1 className="pagetitle">Actions</h1>
      <div className="list panel">
        {ACTIONS.map((a) => (
          <div key={a.name} className="row">
            <div className="l">
              <b>{a.name}</b>
              <span>{a.blurb}</span>
            </div>
            {a.href ? (
              <Link className="btn primary" href={a.href}>
                Run
              </Link>
            ) : (
              <span className="pill">Next up</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
