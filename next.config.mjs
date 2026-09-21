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
    // Origini ammesse per le server action: serve quando l'app sta dietro un
    // indirizzo che non è il suo (la demo pubblica dietro il tunnel). Si
    // elencano in ORIGINI_CONSENTITE nel .env di quell'istanza, separate da
    // virgola; senza, vale solo l'origine stessa.
    serverActions: {
      bodySizeLimit: '12mb',
      ...(process.env.ORIGINI_CONSENTITE ? { allowedOrigins: process.env.ORIGINI_CONSENTITE.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
    },
    serverComponentsExternalPackages: ['@node-rs/argon2', 'pg', 'pdf-parse'],
  },
  // L'interfaccia nuova è un'app statica in public/prototipo/: Next serve i file
  // per percorso esatto e non risolve l'indice di cartella, quindi «/prototipo»
  // da solo dà 404. Il ponte con i dati veri (public/prototipo/bridge/*.js) si attiva
  // solo se il percorso contiene «/prototipo/», perciò serve un redirect — non
  // un rewrite, che lascerebbe l'URL senza la barra finale.
  async redirects() {
    return [
      // 16.9.2026: l'interfaccia della piattaforma è UNA SOLA, ed è questa.
      // Chi entra dalla radice finisce qui; le pagine vecchie restano
      // raggiungibili per indirizzo finché non si spegne quel che c'è solo lì
      // ([[Piattaforma/Una interfaccia sola]]).
      { source: '/', destination: '/prototipo/index.html', permanent: false },
      { source: '/prototipo', destination: '/prototipo/index.html', permanent: false },
      { source: '/prototipo/', destination: '/prototipo/index.html', permanent: false },
    ];
  },
  async headers() {
    return [
      // Interfaccia nuova e dittafono (file statici in public/): mai in cache,
      // così un aggiornamento arriva al primo ricaricamento (13.9.2026).
      { source: '/prototipo/:path*', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/dittafono/:path*', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
