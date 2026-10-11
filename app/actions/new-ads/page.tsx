import Link from "next/link";
import { Brand } from "../../components";
import NewAdsForm from "./form";

export const metadata = { title: "New ads · CREEPTEE HQ" };

export default function NewAdsPage() {
  return (
    <div className="wrap narrow">
      <header className="top">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Brand />
        </Link>
        <nav className="controls">
          <Link className="btn" href="/actions">
            All actions
          </Link>
        </nav>
      </header>
      <div className="ph">
        <h1 className="pagetitle">Ads for a product</h1>
        <span className="meta">Product → paused Meta ads, 4:5 + 9:16</span>
      </div>
      <NewAdsForm />
    </div>
  );
}
