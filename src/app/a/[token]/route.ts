import { NextRequest, NextResponse } from 'next/server';

// Link breve per gli SMS: /a/<token> → /appuntamento/<token>.
// Serve a far stare il promemoria in un solo SMS (160 caratteri):
// i link lunghi spezzati su due SMS risultano cliccabili a metà.
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  // Dietro il reverse proxy req.nextUrl vede localhost: usa l'URL pubblico.
  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  if (base) {
    return NextResponse.redirect(`${base}/appuntamento/${params.token}`, 308);
  }
  const url = req.nextUrl.clone();
  url.pathname = `/appuntamento/${params.token}`;
  return NextResponse.redirect(url, 308);
}
