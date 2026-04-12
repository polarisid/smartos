
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    // Handle pdfjs-dist worker
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?(m)?js$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/worker/[hash][ext]',
      },
    });
    return config;
  },
};

module.exports = withPWA(nextConfig);
