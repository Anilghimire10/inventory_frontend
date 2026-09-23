/** @type {import('next').NextConfig} */
const API_TARGET = process.env.API_URL || 'http://localhost:3000';

// When BUILD_TARGET=mobile we produce a fully static export for Capacitor
// (no Next.js server at runtime, so rewrites/proxy are unavailable and the
// app must talk to an absolute backend URL via NEXT_PUBLIC_API_URL).
const isMobile = process.env.BUILD_TARGET === 'mobile';

const nextConfig = {
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
        async rewrites() {
          // Proxy API calls to the NestJS backend (replaces the old Vite proxy).
          return [{ source: '/api/:path*', destination: `${API_TARGET}/api/:path*` }];
        },
      }),
};

export default nextConfig;
