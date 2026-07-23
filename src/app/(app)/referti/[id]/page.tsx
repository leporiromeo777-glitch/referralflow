import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ReactNode } from 'react';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { dataOra } from '@/lib/format';
import { confermaBozza, scartaBozza } from '../actions';

export const dynamic = 'force-dynamic';

// Revisione di una bozza di referto: testo con i punti segnalati evidenziati,
// divergenze tra le due trascrizioni (mai risolte dal sistema: si mostrano
// entrambe le versioni), allarmi numerici, campi estratti correggibili.

type Divergenza = { contesto?: string; versione_a?: string; versione_b?: string };
type Allarme = { campo?: string; valore?: unknown; intervallo?: string; stato?: string };

type Payload = {
  testo_corretto: string;
  campi_estratti: Record<string, unknown>;
  divergenze: Divergenza[];
  segmenti_dubbi: string[];
  allarmi_numerici: Allarme[];
};

// Evidenzia i frammenti segnalati dentro il testo: prima occorrenza di ogni
// frammento, senza sovrapposizioni. Un frammento che non si ritrova più
// (la correzione l'ha toccato) resta comunque nelle liste sotto: non si
// scarta mai una segnalazione (SPEC §3).
function evidenzia(
  testo: string,
  frammenti: { text: string; tipo: 'divergenza' | 'dubbio' }[]
): { nodi: ReactNode[]; nonTrovati: string[] } {
  const ranges: { start: number; end: number; tipo: string }[] = [];
  const nonTrovati: string[] = [];
  for (const f of frammenti) {
    const t = f.text.trim();
    if (t.length < 3) continue;
    const idx = testo.indexOf(t);
    if (idx === -1) {
      nonTrovati.push(t);
      continue;
    }
    if (ranges.some((r) => idx < r.end && idx + t.length > r.start)) continue;
    ranges.push({ start: idx, end: idx + t.length, tipo: f.tipo });
  }
  ranges.sort((a, b) => a.start - b.start);

  const nodi: ReactNode[] = [];
  let pos = 0;
  ranges.forEach((r, i) => {
    if (r.start > pos) nodi.push(testo.slice(pos, r.start));
    nodi.push(
      <mark key={i} className={r.tipo === 'dubbio' ? 'ref-mark-dubbio' : 'ref-mark-div'}>
        {testo.slice(r.start, r.end)}
      </mark>
    );
    pos = r.end;
  });
  nodi.push(testo.slice(pos));
  return { nodi, nonTrovati };
}

export default async function RefertoBozza({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; err?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isUuid(params.id)) notFound();

  const [row] = await query<{
    id: string;
    stato: string;
    payload: Payload;
    testo_finale: string | null;
    campi_confermati: Record<string, string> | null;
    created_at: string;
    reviewed_at: string | null;
    reviewed_email: string | null;
  }>(
    `select b.id, b.stato, b.payload, b.testo_finale, b.campi_confermati,
            b.created_at::text, b.reviewed_at::text, u.email as reviewed_email
       from referti_bozze b
       left join users u on u.id = b.reviewed_by
      where b.id = $1 and b.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!row) notFound();

  const p = row.payload;
  const divergenze = Array.isArray(p.divergenze) ? p.divergenze : [];
  const dubbi = Array.isArray(p.segmenti_dubbi) ? p.segmenti_dubbi.filter((s) => typeof s === 'string') : [];
  const allarmi = Array.isArray(p.allarmi_numerici) ? p.allarmi_numerici : [];
  const campi = p.campi_estratti && typeof p.campi_estratti === 'object' ? p.campi_estratti : {};

  const frammenti = [
    ...divergenze
      .map((d) => (typeof d?.contesto === 'string' ? d.contesto : ''))
      .filter(Boolean)
      .map((text) => ({ text, tipo: 'divergenza' as const })),
    ...dubbi.map((text) => ({ text, tipo: 'dubbio' as const })),
  ];
  const { nodi } = evidenzia(p.testo_corretto ?? '', frammenti);

  const inBozza = row.stato === 'bozza';
  const valoriNumerici =
    campi.valori_numerici && typeof campi.valori_numerici === 'object' && !Array.isArray(campi.valori_numerici)
      ? (campi.valori_numerici as Record<string, unknown>)
      : null;

  return (
    <>
      <div className="page-head">
        <h1>Bozza di referto</h1>
        <Link className="btn" href="/referti">← Tutte le bozze</Link>
      </div>
      <p className="muted">
        Ricevuta il {dataOra(row.created_at)}.{' '}
        {inBozza
          ? 'Rivedi il testo, correggi dove serve e conferma: niente diventa definitivo da solo.'
          : row.stato === 'confermata'
            ? `Confermata il ${dataOra(row.reviewed_at!)}${row.reviewed_email ? ` da ${row.reviewed_email}` : ''}.`
            : `Scartata il ${dataOra(row.reviewed_at!)}${row.reviewed_email ? ` da ${row.reviewed_email}` : ''}.`}
      </p>

      {searchParams.ok === 'confermata' && (
        <div className="card notice"><p>Bozza confermata ✓</p></div>
      )}
      {searchParams.err === 'testo' && (
        <p className="error">Il testo del referto non può essere vuoto.</p>
      )}

      {allarmi.length > 0 && (
        <div className="card">
          <h2>⚠ Allarmi numerici</h2>
          <p className="muted">
            Valori fuori o al limite dell'intervallo atteso. Il sistema non li
            corregge mai: verifica sull'audio o col medico.
          </p>
          <ul>
            {allarmi.map((a, i) => (
              <li key={i}>
                <strong>{String(a.campo ?? 'valore')}</strong>: {String(a.valore ?? '?')}{' '}
                <span className="muted">
                  (atteso {String(a.intervallo ?? '?')} — {String(a.stato ?? 'da verificare')})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Testo del referto</h2>
        {frammenti.length > 0 && (
          <p className="muted">
            Evidenziati: <mark className="ref-mark-div">divergenze tra le due trascrizioni</mark>{' '}
            e <mark className="ref-mark-dubbio">segmenti dubbi</mark>.
          </p>
        )}
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {inBozza ? nodi : (row.testo_finale ?? p.testo_corretto)}
        </div>
      </div>

      {divergenze.length > 0 && (
        <div className="card">
          <h2>Divergenze tra le due trascrizioni</h2>
          <p className="muted">
            Dove le due passate di trascrizione non coincidono c'è quasi sempre un
            problema audio. Il sistema non sceglie mai la versione giusta: decidi tu.
          </p>
          <ul>
            {divergenze.map((d, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                {d.contesto && <div className="muted">…{d.contesto}…</div>}
                <div><strong>A:</strong> {d.versione_a ?? '—'}</div>
                <div><strong>B:</strong> {d.versione_b ?? '—'}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dubbi.length > 0 && (
        <div className="card">
          <h2>Segmenti dubbi</h2>
          <p className="muted">Segnalati dall'ispezione come incomprensibili o privi di senso medico.</p>
          <ul>{dubbi.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      {inBozza ? (
        <form action={confermaBozza} className="card form">
          <input type="hidden" name="id" value={row.id} />
          <h2>Campi estratti</h2>
          <p className="muted">
            Estratti automaticamente dal testo, mai dedotti: «non indicato» significa
            che nel dettato non c'era. Correggili qui prima di confermare.
          </p>
          <div className="grid2">
            {Object.entries(campi)
              .filter(([, v]) => typeof v === 'string')
              .map(([k, v]) => (
                <label key={k}>{k.replaceAll('_', ' ')}
                  <input name={`campo__${k}`} maxLength={2000} defaultValue={String(v)} />
                </label>
              ))}
          </div>
          {valoriNumerici && Object.keys(valoriNumerici).length > 0 && (
            <>
              <h3>Valori numerici rilevati</h3>
              <p className="muted">
                Riportati come dettati, mai corretti (gli eventuali sospetti sono
                negli allarmi qui sopra). Se uno è sbagliato, correggi il testo.
              </p>
              <ul>
                {Object.entries(valoriNumerici).map(([k, v]) => (
                  <li key={k}><strong>{k.replaceAll('_', ' ')}</strong>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
                ))}
              </ul>
            </>
          )}

          <h2 style={{ marginTop: 18 }}>Testo da confermare</h2>
          <p className="muted">
            Questo è il testo che verrà confermato: sistemalo qui (le evidenziazioni
            restano nella vista sopra come guida).
          </p>
          <textarea name="testo" rows={16} required defaultValue={p.testo_corretto}
            style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.5 }} />

          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Conferma il referto</button>
          </div>
        </form>
      ) : (
        row.campi_confermati && Object.keys(row.campi_confermati).length > 0 && (
          <div className="card">
            <h2>Campi confermati</h2>
            <ul>
              {Object.entries(row.campi_confermati).map(([k, v]) => (
                <li key={k}><strong>{k.replaceAll('_', ' ')}</strong>: {v || '—'}</li>
              ))}
            </ul>
          </div>
        )
      )}

      {inBozza && (
        <form action={scartaBozza} className="card">
          <input type="hidden" name="id" value={row.id} />
          <p className="muted">
            Se questa bozza non va tenuta (dettato di prova, doppione, audio
            inutilizzabile), scartala: resta in archivio come «scartata».
          </p>
          <button className="btn" type="submit">Scarta la bozza</button>
        </form>
      )}
    </>
  );
}
