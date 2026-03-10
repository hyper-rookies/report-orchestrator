import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// `/shared/*` is the legacy report share route, while `/share/*` is used by the
// current dashboard and session share flows.
const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback", "/shared/", "/share/"];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true") {
    return NextResponse.next();
  }

  const hasSession = Array.from(request.cookies.getAll()).some(
    (c) =>
      c.name.includes("CognitoIdentityServiceProvider") ||
      c.name.includes("amplify-signin") ||
      c.name.includes("amplify")
  );

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
