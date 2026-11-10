import type { NextConfig } from 'next';

function getBackendUrl(): string {
  const url = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    return url.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return 'https://api.laundelle.co.uk';
  }
  return (url || 'http://127.0.0.1:4000').replace(/\/$/, '');
}

const nextConfig: NextConfig = {
  transpilePackages: [
    '@laundelle/ui',
    '@laundelle/types',
    '@laundelle/api-client',
    '@laundelle/auth',
    '@laundelle/utils',
    '@laundelle/validations',
    '@laundelle/config',
    '@laundelle/ids',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    const backendUrl = getBackendUrl();
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/cancellation-and-refund',
        destination: '/cancellationandrefund',
        permanent: true,
      },
      {
        source: '/privacy-policy',
        destination: '/privacypolicy',
        permanent: true,
      },
      {
        source: '/terms-and-conditions',
        destination: '/termsandconditions',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
