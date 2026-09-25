import type { NextConfig } from 'next'

// Headers estáticos (RN-ACE-15). A CSP com nonce entra em proxy.ts no M2.
const headersSeguranca = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  // Imagem Docker mínima: só o servidor e as dependências rastreadas (docs/spec/08 §8.2).
  output: 'standalone',
  poweredByHeader: false,
  typedRoutes: true,
  // Capas e avatares vêm otimizados do CDN da Steam; dispensa o sharp na imagem. Sem
  // remotePatterns: o otimizador não busca host remoto nenhum (14 SEG-05).
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  headers: () => Promise.resolve([{ source: '/:path*', headers: headersSeguranca }]),
}

export default nextConfig
