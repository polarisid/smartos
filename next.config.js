
// Sem a regra 'cross-origin' do next-pwa: ela passava TODA chamada a outros sites (ViaCEP, rotas, Supabase) pelo service worker,
// com cache por endereço (não por usuário) e erros 'no-response' no console quando a rede falha. Sem ela essas chamadas
// vão direto à rede, como antes do service worker existir.
const defaultCache = require('next-pwa/cache').filter(rule => rule.options?.cacheName !== 'cross-origin');

const withPWA = require('next-pwa')({
  dest: 'public',
  // O registro é feito por src/components/ServiceWorkerRegister.tsx (o automático do next-pwa não funciona no App Router).
  register: false,
  skipWaiting: true,
  // Telas do técnico (documento HTML, sem as requisições internas do Next `_rsc`) ficam num cache SÓ delas, por
  // 7 dias: antes dividiam um cache de 32 itens com tudo e eram expulsas, e sem sinal a tela não abria.
  // A lista é repetida em src/lib/offlinePages.ts (a função abaixo vai inteira para o service worker).
  runtimeCaching: [
    {
      // Chamadas autenticadas do próprio site (/api com authorization) nunca passam pelo cache do service worker:
      // o cache é por endereço, não por usuário, e poderia entregar dados de outra pessoa no mesmo aparelho.
      // (Chamadas a outros sites, como o Supabase, nem entram no service worker.)
      urlPattern: ({ url, request }) => self.origin === url.origin && (request.headers.has('apikey') || request.headers.has('authorization')),
      handler: 'NetworkOnly',
    },
    {
      urlPattern: ({ url, request }) => {
        const pages = ['/', '/routes', '/reports', '/meus-relatorios', '/producao', '/scanner', '/dashboard', '/ranking', '/ajuda', '/veiculo'];
        return self.origin === url.origin && pages.includes(url.pathname) && request.headers.get('RSC') !== '1' && !url.searchParams.has('_rsc');
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'app-pages',
        expiration: { maxEntries: 24, maxAgeSeconds: 7 * 24 * 60 * 60 },
        networkTimeoutSeconds: 3,
        // Atualizar a tela com parâmetros na URL (ex.: /routes?x=1, ?source=pwa) também acha a cópia guardada.
        matchOptions: { ignoreSearch: true },
      },
    },
    ...defaultCache,
  ],
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
