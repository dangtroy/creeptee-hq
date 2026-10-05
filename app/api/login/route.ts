import { NextResponse } from "next/server";
import { COOKIE, hashPassword, safeEqual, sessionValue } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const expected = await sessionValue();
  const given = await hashPassword(String(form.get("password") || ""));
  if (!expected || !safeEqual(given, expected)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
