import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true") {
    return NextResponse.next();
  }

  const hasSession = Array.from(request.cookies.getAll()).some((c) =>
    c.name.includes("CognitoIdentityServiceProvider")
  );

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
