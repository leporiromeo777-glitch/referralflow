import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { cambi, medicoValido, type Dispositivi } from '@/lib/dittafono-dispositivi';
import { vietato } from '@/lib/permessi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Il microfono di ogni medico (20.10.2026, [[Piattaforma/Dittafono]]): tasto imparato, microfono e Dragon per profilo
// di chi detta, così sceglierlo basta e il medico parte subito, da qualunque computer dello studio.
//   GET → { profili: { <medico>: { tasto, microfono, dettatura } } }
//   POST { medico, tasto?, microfono?, dettatura? } → { ok, profilo }   (solo i campi mandati cambiano)
export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'dittafono');
  if (no) return no;
  const righe = await query<Dispositivi & { medico: string }>(`select medico, tasto, microfono, dettatura from dittafono_dispositivi where studio_id = $1`, [session.studioId]);
  return NextResponse.json({ profili: Object.fromEntries(righe.map((r) => [r.medico, { tasto: r.tasto, microfono: r.microfono, dettatura: r.dettatura }])) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'dittafono');
  if (no) return no;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const medico = medicoValido(b?.medico);
  if (!b || !medico) return NextResponse.json({ errore: 'medico non valido' }, { status: 400 });
  const c = cambi(b);
  if ('errore' in c) return NextResponse.json({ errore: c.errore }, { status: 400 });
  const v = c.ok;
  const [r] = await query<Dispositivi>(
    `insert into dittafono_dispositivi (studio_id, medico, tasto, microfono, dettatura, aggiornato_da)
     values ($1, $2, $3::jsonb, $4, $5, $6)
     on conflict (studio_id, medico) do update set
       tasto = case when $7 then excluded.tasto else dittafono_dispositivi.tasto end,
       microfono = case when $8 then excluded.microfono else dittafono_dispositivi.microfono end,
       dettatura = case when $9 then excluded.dettatura else dittafono_dispositivi.dettatura end,
       aggiornato_at = now(), aggiornato_da = excluded.aggiornato_da
     returning tasto, microfono, dettatura`,
    [session.studioId, medico, v.tasto ? JSON.stringify(v.tasto) : null, v.microfono ?? null, v.dettatura ?? null, session.id,
      'tasto' in v, 'microfono' in v, 'dettatura' in v]);
  console.log(`[dittafono] dispositivi di un medico salvati: ${Object.keys(v).join(', ')}`);
  return NextResponse.json({ ok: true, profilo: r });
}
