import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export: served from S3 + CloudFront; data comes from /graphql at runtime.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
