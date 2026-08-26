import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "@/lib/csp";

// The project's first middleware, and deliberately its only responsibility:
// mint a nonce and attach the Content Security Policy. Authorization stays in
// `auth.ts` where the pages read it — routing every request through an Edge
// auth check would be a behaviour change, not a header change.
//
// The nonce goes on the REQUEST as well as the response. Next reads the policy
// off the incoming `content-security-policy` header, pulls the nonce out of
// it, and stamps that value onto its own inline bootstrap scripts and preload
// tags. Without that half, the policy would block the framework's own output.

export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except build output. `_next/static` is JS, CSS, and fonts —
      // a policy governs how a document loads resources, not how an already
      // loaded script behaves. `_next/image` already carries its own far
      // stricter policy, set by `images.contentSecurityPolicy` in next.config.
      source: "/((?!_next/static|_next/image).*)",
      // Prefetches fetch an RSC payload, not a document. Minting a nonce for
      // one would be wasted work, and the nonce that matters is the one in the
      // document that eventually renders it.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
