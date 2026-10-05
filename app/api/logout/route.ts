import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.cookies.delete(COOKIE);
  return res;
}
