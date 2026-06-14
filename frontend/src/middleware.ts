import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeJwt(token: string): { role?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) return NextResponse.next();

  const token = request.cookies.get("access_token")?.value;
  const isLogin = pathname === "/login" || pathname === "/login/";

  if (isLogin) {
    if (token && decodeJwt(token)?.role) {
      return NextResponse.redirect(new URL("/admin?tab=dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!pathname.startsWith("/cs") && !pathname.startsWith("/admin")) return NextResponse.next();

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("return_to", pathname + (request.nextUrl.search || ""));
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwt(token);
  if (payload?.role === "cs" && pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/cs?tab=all", request.url));
  }

  if (pathname.startsWith("/cs")) {
    const chatId = request.nextUrl.searchParams.get("chatId");
    if (chatId && !UUID_REGEX.test(chatId)) {
      const tab = searchParams.get("tab") || "all";
      return NextResponse.redirect(new URL(`/cs?tab=${tab}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|manifest.json|sw.js).*)"],
};
