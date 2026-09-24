/** @type {import('next').NextConfig} */
const API_TARGET = process.env.API_URL || 'http://localhost:3000';

// When BUILD_TARGET=mobile we produce a fully static export for Capacitor
// (no Next.js server at runtime, so rewrites/proxy are unavailable and the
// app must talk to an absolute backend URL via NEXT_PUBLIC_API_URL).
const isMobile = process.env.BUILD_TARGET === 'mobile';

// Security headers for every page. Deliberately no script-src/style-src CSP:
// the App Router hydrates through inline scripts, so a script policy that
// works needs per-request nonces (dynamic rendering on every page), and one
// with 'unsafe-inline' stops nothing. What is here is the part that can't
// break the app: no framing (clickjacking), no plugins, no <base> hijack.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Browsers ignore this over plain http, so it is harmless on localhost.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];

const nextConfig = {
  poweredByHeader: false,
  // The React Compiler memoises components automatically, which is the whole
  // of what a manual useMemo/useCallback sweep would have bought here -- and
  // it does it without anyone having to guess which derived value was worth
  // wrapping. InventoryPage and CartPanel had zero memoisation between them,
  // which on a low-end Android till is felt as lag in the cart.
  //
  // Stable in Next 16. It runs through Babel, so dev and build compile a
  // little slower; that is the trade.
  reactCompiler: true,
  ...(isMobile
    ? {
        output: 'export',
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // Only the server build: a static export has no server to send
        // headers, and Next refuses the option there.
        async headers() {
          return [{ source: '/:path*', headers: securityHeaders }];
        },
        async rewrites() {
          // Proxy API calls to the NestJS backend (replaces the old Vite proxy).
          return [{ source: '/api/:path*', destination: `${API_TARGET}/api/:path*` }];
        },
      }),
};

export default nextConfig;
