/** @type {import('next').NextConfig} */
const API_TARGET = process.env.API_URL || 'http://localhost:3000';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // Proxy API calls to the NestJS backend (replaces the old Vite proxy).
    return [{ source: '/api/:path*', destination: `${API_TARGET}/api/:path*` }];
  },
};

export default nextConfig;
