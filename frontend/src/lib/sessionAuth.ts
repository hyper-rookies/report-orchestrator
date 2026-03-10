import { decodeJwt } from "jose";
import type { NextRequest } from "next/server";

export function getUserSub(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice(7);

  try {
    const payload = decodeJwt(token);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
