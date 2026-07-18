import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('rf_session')?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      // Le sessioni emesse prima del multi-studio (senza studioId) non valgono
      // più — tranne per gli invianti, che uno studio non ce l'hanno.
      role = (payload.studioId || payload.role === 'inviante')
        ? ((payload.role as string) ?? null)
        : null;
    } catch {
      role = null;
    }
  }
  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const path = req.nextUrl.pathname;

  // Il ruolo medico vede solo il proprio programma (più la pagina Sicurezza,
  // che è personale): coda, referral, medici, statistiche e configurazione
  // feed restano a segreteria/admin.
  if (role === 'medico') {
    const consentito =
      (path.startsWith('/programma') && !path.startsWith('/programma/feed')) ||
      path.startsWith('/sicurezza') ||
      path.startsWith('/profilo');
    if (!consentito) {
      const url = req.nextUrl.clone();
      url.pathname = '/programma';
      return NextResponse.redirect(url);
    }
  }

  // L'inviante registrato vede solo la sua area «I miei invii» (più Sicurezza).
  if (role === 'inviante' && !path.startsWith('/invii') && !path.startsWith('/sicurezza') && !path.startsWith('/profilo')) {
    const url = req.nextUrl.clone();
    url.pathname = '/invii';
    return NextResponse.redirect(url);
  }

  // Le impostazioni (gestione utenti dello studio) sono solo per l'admin.
  if (path.startsWith('/impostazioni') && role !== 'admin') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protegge tutto tranne le pagine pubbliche (login, invia, portale),
  // le API (che verificano la sessione da sole) e i file statici
  // (percorsi con estensione: icone, manifest — mai dati).
  // Così le pagine interne future sono protette di default.
  matcher: ['/((?!login|password-dimenticata|reimposta-password/|invia|portale/|appuntamento/|affido/|a/|privacy|termini|trattamento-dati|registrazione|attiva|api/|_next/|.*\\..*).*)'],
};
