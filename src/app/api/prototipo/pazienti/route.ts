import { riabbinaPazienti } from '@/lib/pazienti-abbina';
import { proponiAnagrafica } from '@/lib/pazienti-abbina-regole';
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { analizzaCsvPazienti, CAMPI_ANAGRAFICA, validaAnagrafica, type Anagrafica } from '@/lib/pazienti-import';

export const dynamic = 'force-dynamic';

// Anagrafica dei pazienti dal prototipo (14.9.2026): crea, aggiorna, importa
// da CSV (anteprima, poi conferma). Tutti i ruoli dello studio; l'inviante no.
// Nei log solo conteggi e id abbreviati.
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function esistenti(studioId: string): Promise<Map<string, string>> {
  const righe = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studioId]);
  const k = (c: string, n: string, d: string | null) => `${c.toLowerCase().trim()}|${n.toLowerCase().trim()}|${d ?? ''}`;
  return new Map(righe.map((r) => [k(r.cognome, r.nome, r.data_nascita), r.id]));
}
const chiave = (a: Anagrafica) => `${a.cognome.toLowerCase()}|${a.nome.toLowerCase()}|${a.data_nascita ?? ''}`;

async function inserisci(studioId: string, a: Anagrafica): Promise<string> {
  const [r] = await query<{ id: string }>(
    `insert into patients (studio_id, cognome, nome, data_nascita, telefono, assicurazione, sesso, via, npa, localita, email, avs, n_assicurato, indicazione, percorso_id)
     values ($1, $2, $3, $4, nullif($5, ''), nullif($6, ''), nullif($7, ''), nullif($8, ''), nullif($9, ''), nullif($10, ''), nullif($11, ''), nullif($12, ''), nullif($13, ''), nullif($14, ''), nullif($15, '')) returning id`,
    [studioId, a.cognome, a.nome, a.data_nascita, a.telefono, a.assicurazione, a.sesso, a.via, a.npa, a.localita, a.email, a.avs, a.n_assicurato, a.indicazione, a.percorso_id]);
  return r.id;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const sid = session.studioId;
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  if (azione === 'crea' || azione === 'aggiorna') {
    const campi: Record<string, unknown> = {};
    for (const k of CAMPI_ANAGRAFICA) campi[k] = c?.[k];
    const { dati, errori } = validaAnagrafica(campi);
    if (Object.keys(errori).length) return NextResponse.json({ errori }, { status: 400 });
    if (azione === 'crea') {
      const dup = (await esistenti(sid)).get(chiave(dati));
      if (dup) return NextResponse.json({ errore: 'Paziente già in cartella (stesso cognome, nome e data di nascita).', id: dup }, { status: 409 });
      const id = await inserisci(sid, dati);
      console.log(`[pazienti] creato ${id.slice(0, 8)}`);
      // La cartella nuova si prende subito i suoi appuntamenti e i suoi referti (abbinamento severo).
      const abbinati = await riabbinaPazienti(sid).catch(() => ({ appuntamenti: 0, referti: 0 }));
      return NextResponse.json({ id, abbinati }, { status: 201 });
    }
    const id = String(c?.id ?? '');
    if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    const r = await query(
      `update patients set cognome = $3, nome = $4, data_nascita = $5, telefono = nullif($6, ''), assicurazione = nullif($7, ''), sesso = nullif($8, ''), via = nullif($9, ''), npa = nullif($10, ''), localita = nullif($11, ''), email = nullif($12, ''), avs = nullif($13, ''), n_assicurato = nullif($14, ''), indicazione = nullif($15, ''), percorso_id = nullif($16, '')
        where id = $1 and studio_id = $2 returning id`,
      [id, sid, dati.cognome, dati.nome, dati.data_nascita, dati.telefono, dati.assicurazione, dati.sesso, dati.via, dati.npa, dati.localita, dati.email, dati.avs, dati.n_assicurato, dati.indicazione, dati.percorso_id]);
    if (!r.length) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 });
    console.log(`[pazienti] aggiornato ${id.slice(0, 8)}`);
    const abbinati = await riabbinaPazienti(sid).catch(() => ({ appuntamenti: 0, referti: 0 }));
    return NextResponse.json({ id, abbinati });
  }
  if (azione === 'proponi') {
    // «Crea cartella» dall'agenda: cognome, nome e nascita proposti dal titolo
    // dell'appuntamento. È una proposta: la conferma chi salva il modulo.
    return NextResponse.json({ proposta: proponiAnagrafica(String(c?.titolo ?? '').slice(0, 300)) });
  }
  if (azione === 'importa' || azione === 'importa_conferma') {
    const testo = String(c?.csv ?? '').slice(0, 2_000_000);
    const an = analizzaCsvPazienti(testo);
    if (!an.righe.length) return NextResponse.json({ errore: 'Nessuna riga: serve un\'intestazione (cognome; nome; data di nascita; …) e almeno un paziente.' }, { status: 400 });
    if (!an.colonne.includes('cognome') || !an.colonne.includes('nome')) return NextResponse.json({ errore: 'Mancano le colonne «cognome» e «nome».', ignorate: an.ignorate }, { status: 400 });
    const gia = await esistenti(sid);
    const visti = new Set<string>();
    const righe = an.righe.map((r) => {
      const k = chiave(r.dati);
      const stato = Object.keys(r.errori).length ? 'errore' : gia.has(k) ? 'esiste' : visti.has(k) ? 'doppione' : 'nuovo';
      visti.add(k);
      return { n: r.n, stato, dati: r.dati, errori: r.errori };
    });
    const riepilogo = { totale: righe.length, nuovi: righe.filter((r) => r.stato === 'nuovo').length, esistenti: righe.filter((r) => r.stato === 'esiste').length, errori: righe.filter((r) => r.stato === 'errore').length, doppioni: righe.filter((r) => r.stato === 'doppione').length };
    if (azione === 'importa') return NextResponse.json({ colonne: an.colonne, ignorate: an.ignorate, righe, riepilogo });
    let inseriti = 0;
    for (const r of righe) if (r.stato === 'nuovo') { await inserisci(sid, r.dati); inseriti++; }
    console.log(`[pazienti] importati ${inseriti} su ${righe.length} righe (esistenti ${riepilogo.esistenti}, errori ${riepilogo.errori})`);
    // Con l'anagrafica dentro, agenda e referti trovano le loro cartelle in un colpo solo.
    const abbinati = inseriti ? await riabbinaPazienti(sid).catch(() => ({ appuntamenti: 0, referti: 0 })) : { appuntamenti: 0, referti: 0 };
    return NextResponse.json({ inseriti, riepilogo, abbinati });
  }
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
