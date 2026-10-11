import { listAdSets } from "@/lib/meta-write";
import { recentProducts } from "@/lib/shopify-write";

// Products to pick from, plus the ad sets new ads can go into.
export async function POST() {
  const [products, adsets] = await Promise.allSettled([recentProducts(), process.env.META_ACCESS_TOKEN ? listAdSets() : Promise.reject(new Error("META_ACCESS_TOKEN isn't set in Vercel."))]);
  return Response.json({
    products: products.status === "fulfilled" ? products.value : [],
    productsError: products.status === "rejected" ? String(products.reason?.message || products.reason) : null,
    adsets: adsets.status === "fulfilled" ? adsets.value : [],
    adsetsError: adsets.status === "rejected" ? String(adsets.reason?.message || adsets.reason) : null,
  });
}
