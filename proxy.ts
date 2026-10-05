import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, safeEqual, sessionValue } from "@/lib/auth";

// Every page needs the login cookie, except the login page and its handler.
export async function proxy(request: NextRequest) {
  const expected = await sessionValue();
  const got = request.cookies.get(COOKIE)?.value || "";
  if (expected && safeEqual(got, expected)) return NextResponse.next();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
