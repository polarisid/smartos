
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // O service worker só "ativa" se TODOS os arquivos do pré-cache baixarem. O Next 14 lista o
  // app-build-manifest.json, que em produção responde 404 - isso derrubava a instalação do
  // service worker (sem SW não há push nem cache offline). Também não pré-carrega os PDFs
  // de checklist (pesados; baixam quando usados).
  buildExcludes: [/app-build-manifest\.json$/],
  publicExcludes: ['!checklists/**/*', '!noprecache/**/*'],
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
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
    return config;
  },
};

module.exports = withPWA(nextConfig);
