import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

