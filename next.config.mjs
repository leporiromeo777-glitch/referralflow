// L'app non carica script/font/immagini da domini esterni (nessun CDN, nessun
// font di Google): la CSP può quindi restringersi a 'self' senza rompere nulla.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // Dittafono dal telefono (13.9.2026): riproduce i segmenti registrati da URL blob.
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Microfono solo per le pagine della piattaforma stessa (dittafono dal telefono, 13.9.2026).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
    serverComponentsExternalPackages: ['@node-rs/argon2', 'pg', 'pdf-parse'],
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
