import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReferralFlow',
  description: 'La piattaforma delle referral tra studi medici',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#0f6e56',
  // Esplicito: la pagina si adatta alla larghezza del telefono, scala 1:1.
  // (l'utente può comunque zoomare a mano — nessun blocco.)
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
