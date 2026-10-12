import Link from "next/link";
import { Brand } from "../../components";
import NewProductForm from "./form";

export const metadata = { title: "New product · CREEPTEE HQ" };

export default function NewProductPage() {
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
        <h1 className="pagetitle">New product</h1>
        <span className="meta">Art in → Printify product + Shopify draft</span>
      </div>
      <NewProductForm />
    </div>
  );
}
