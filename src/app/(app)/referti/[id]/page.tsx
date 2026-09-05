import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ReactNode } from 'react';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { dataOra } from '@/lib/format';
import { confermaBozza, scartaBozza, ripristinaBozza, eliminaBozza, richiediFusione, applicaFusione } from '../actions';
import { agganciaRiferimenti } from '@/lib/referti-allegati';
import { AudioDettato } from '../AudioDettato';
import { TestoDettato } from '../TestoDettato';
import { RevisioneGuidata } from './RevisioneGuidata';
import RiorganizzaAI from './RiorganizzaAI';

export const dynamic = 'force-dynamic';

// Revisione di una bozza di referto: testo con i punti segnalati evidenziati,
// divergenze tra le due trascrizioni (mai risolte dal sistema: si mostrano
// entrambe le versioni), allarmi numerici, campi estratti correggibili.

type Divergenza = { contesto?: string; versione_a?: string; versione_b?: string };
type Allarme = { campo?: string; valore?: unknown; intervallo?: string; stato?: string };

type Payload = {
  testo_corretto: string;
  note_segreteria?: string[];
  campi_estratti: Record<string, unknown>;
  divergenze: Divergenza[];
  segmenti_dubbi: string[];
  allarmi_numerici: Allarme[];
  avvisi?: string[];
  parole?: [string, number][];
  divagazioni?: string[];
  frasi_da_chiarire?: { frase: string; proposta: string }[];
  frasi_non_supportate?: { frase: string; motivo: string }[];
  riparazioni_applicate?: { da: string; a: string }[];
  testo_grezzo?: string;
  testo_strutturato?: string;
  revisione?: { quota_modificata?: number; distanza_parole?: number; parole_finali?: number; tempo_revisione_s?: number; flag_totali?: number; flag_accettati_senza_riascolto?: number };
  rischio_frasi?: { frase: string; punteggio: number; motivi?: string[] }[];
  numeri?: { valore: string; unita?: string; frase?: number | null; secondo?: number | null; confermato?: boolean | null }[];
};

// Evidenzia i frammenti segnalati dentro il testo: prima occorrenza di ogni
// frammento, senza sovrapposizioni. Un frammento che non si ritrova più
// (la correzione l'ha toccato) resta comunque nei dettagli tecnici: non si
// scarta mai una segnalazione (SPEC §3). `spiega` compare al passaggio del
// mouse (es. cosa ha sentito l'altra trascrizione).
function evidenzia(
  testo: string,
  frammenti: { text: string; tipo: 'divergenza' | 'dubbio'; spiega?: string }[]
): {
  nodi: ReactNode[];
  nonTrovati: string[];
  marcati: number;
  ranges: { start: number; end: number; tipo: string; spiega?: string }[];
} {
  const ranges: { start: number; end: number; tipo: string; spiega?: string }[] = [];
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
    ranges.push({ start: idx, end: idx + t.length, tipo: f.tipo, spiega: f.spiega });
  }
  ranges.sort((a, b) => a.start - b.start);

  const nodi: ReactNode[] = [];
  let pos = 0;
  ranges.forEach((r, i) => {
    if (r.start > pos) nodi.push(testo.slice(pos, r.start));
    nodi.push(
      <mark
        key={i}
        className={r.tipo === 'dubbio' ? 'ref-mark-dubbio' : 'ref-mark-div'}
        title={r.spiega}
      >
        {testo.slice(r.start, r.end)}
      </mark>
    );
    pos = r.end;
  });
  nodi.push(testo.slice(pos));
  return { nodi, nonTrovati, marcati: ranges.length, ranges };
}

// Provenienza di una riga della lettera fusa (lettera incrementale):
// etichetta e colore. «dettato» = detto oggi, «precedente» = copiato dalla
// lettera precedente, «aggiornato» = paragrafo esame riscritto coi valori
// nuovi (guardia numerica), «misto» = riga che unisce le due fonti.
const PROVENIENZA: Record<string, { testo: string; fg: string; bg: string }> = {
  dettato: { testo: 'dettato oggi', fg: '#0d5c48', bg: '#e3ece8' },
  precedente: { testo: 'lettera precedente', fg: '#2c5c86', bg: '#e0e8f0' },
  aggiornato: { testo: 'aggiornato coi valori nuovi', fg: '#8a5d0c', bg: '#f3e9d6' },
  misto: { testo: 'precedente + oggi', fg: '#5a4a86', bg: '#e9e4f2' },
  modello: { testo: 'formato', fg: '#6d7a74', bg: '#ecebe6' },
};
function chipProvenienza(origine: string | undefined) {
  const v = origine ? PROVENIENZA[origine] : undefined;
  if (!v) return null;
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
      color: v.fg, background: v.bg, borderRadius: 4, padding: '2px 6px', marginLeft: 8,
      whiteSpace: 'nowrap', verticalAlign: 'middle',
    }}>{v.testo}</span>
  );
}

// Traduce un allarme numerico in una frase semplice per chi rivede la bozza.
// Formulazione da CONTROLLO DI TRASCRIZIONE (2026-09-05): niente intervalli
// clinici a schermo e niente «valore fuori norma» — un avviso che dà
// informazioni per una decisione diagnostica rientra nella regola 11 del
// regolamento dispositivi (MDCG 2019-11 rev. 1). Qui si segnala solo che il
// numero, per il campo in cui è finito, è insolito da trascrivere.
function fraseAllarme(a: Allarme): string {
  switch (a.stato) {
    case 'fuori':
      return `numero insolito per questo campo, spesso una cifra sentita male (una cifra in più o in meno): riascolta l'audio su questo punto`;
    case 'limite':
      return `numero raro per questo campo: vale un riascolto`;
    case 'non_trovato_nel_testo':
      return `questo numero non si ritrova nel testo: controlla che sia giusto`;
    default:
      return `da riascoltare`;
  }
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
    tipo: string;
    payload: Payload;
    testo_finale: string | null;
    campi_confermati: Record<string, string> | null;
    created_at: string;
    reviewed_at: string | null;
    reviewed_email: string | null;
  }>(
    `select b.id, b.stato, b.tipo, b.payload, b.testo_finale, b.campi_confermati,
            b.created_at::text, b.reviewed_at::text, u.email as reviewed_email
       from referti_bozze b
       left join users u on u.id = b.reviewed_by
      where b.id = $1 and b.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!row) notFound();

  // Audio collegato (dettato caricato dal drag & drop): riascoltabile qui.
  const [audio] = await query<{ id: string; filename: string }>(
    'select id, filename from referti_audio where bozza_id = $1 and studio_id = $2',
    [params.id, session.studioId]
  );

  const p = row.payload;

  // Lettera incrementale: stato della fusione chiesta (se c'è) e proposta
  // automatica della lettera precedente = ultimo referto CONFERMATO dello
  // stesso paziente (nome + data di nascita dai campi, confermati o estratti).
  const fusione = (p as any).fusione && typeof (p as any).fusione === 'object'
    ? ((p as any).fusione as { stato?: string; lettera_precedente?: string; testo_fuso?: string; errore?: string; richiesta_at?: string; provenienza?: string[]; riepilogo?: Record<string, number> })
    : null;
  const campiRif = { ...(p.campi_estratti ?? {}), ...(row.campi_confermati ?? {}) } as Record<string, unknown>;
  const nomePaz = typeof campiRif.nome_paziente === 'string' ? campiRif.nome_paziente.trim() : '';
  const nascitaPaz = typeof campiRif.data_nascita === 'string' ? campiRif.data_nascita.trim() : '';
  const [precedente] = nomePaz
    ? await query<{ id: string; testo_finale: string; reviewed_at: string }>(
        `select id, testo_finale, reviewed_at::text
           from referti_bozze
          where studio_id = $1 and id <> $2 and stato = 'confermata'
            and testo_finale is not null
            and lower(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', '')) = lower($3)
            and ($4 = '' or coalesce(campi_confermati->>'data_nascita', payload->'campi_estratti'->>'data_nascita', '') in ('', $4))
          order by reviewed_at desc
          limit 1`,
        [session.studioId, params.id, nomePaz, nascitaPaz]
      )
    : [];

  const divergenze = Array.isArray(p.divergenze) ? p.divergenze : [];
  const dubbi = Array.isArray(p.segmenti_dubbi) ? p.segmenti_dubbi.filter((s) => typeof s === 'string') : [];
  const allarmi = Array.isArray(p.allarmi_numerici) ? p.allarmi_numerici : [];
  const avvisi = Array.isArray(p.avvisi) ? p.avvisi.filter((a): a is string => typeof a === 'string') : [];
  const campi = p.campi_estratti && typeof p.campi_estratti === 'object' ? p.campi_estratti : {};

  const frammenti = [
    ...divergenze
      .filter((d) => typeof d?.contesto === 'string' && d.contesto)
      .map((d) => ({
        text: d.contesto as string,
        tipo: 'divergenza' as const,
        spiega: d.versione_b
          ? `L'audio qui non era chiaro. L'altra trascrizione dice: «${d.versione_b}»`
          : `L'audio qui non era chiaro: riascoltalo.`,
      })),
    ...dubbi.map((text) => ({
      text,
      tipo: 'dubbio' as const,
      spiega: 'Questo passaggio sembra poco chiaro: riascolta l’audio.',
    })),
  ];
  const { nodi, marcati, ranges } = evidenzia(p.testo_corretto ?? '', frammenti);

  // Tempi parola-per-parola dalla pipeline: se ci sono (e c'è l'audio), il
  // testo diventa sincronizzato — parola illuminata durante l'ascolto, clic
  // per saltare. Senza, si mostra il testo semplice di sempre.
  const parole = (Array.isArray(p.parole) ? p.parole : []).filter(
    (x): x is [string, number] =>
      Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'number'
  );

  // Aggancio dei riferimenti citati nelle note («allega la vecchia email…»):
  // candidati dalla cartella del paziente e dagli allegati delle sue referral.
  const noteRif = await agganciaRiferimenti(
    session.studioId,
    typeof campi.nome_paziente === 'string' ? campi.nome_paziente : null,
    Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n): n is string => typeof n === 'string') : []
  );
  const daProcurare = noteRif.filter((n) => n.riguardaDocumenti && n.candidati.length === 0);

  const inBozza = row.stato === 'bozza';
  const valoriNumerici =
    campi.valori_numerici && typeof campi.valori_numerici === 'object' && !Array.isArray(campi.valori_numerici)
      ? (campi.valori_numerici as Record<string, unknown>)
      : null;

  return (
    <div className="referto-largo">
      <div className="page-head">
        <h1>{row.tipo === 'visita'
          ? (row.stato === 'confermata' ? 'Nota di visita' : 'Bozza di nota di visita')
          : (row.stato === 'confermata' ? 'Referto' : 'Bozza di referto')}</h1>
        <a className="btn btn-primary" href={`/api/referti/docx/${row.id}`}>
          Word in carta intestata
        </a>
        <a className="btn" href={`/api/referti/pdf/${row.id}`} target="_blank">
          Scarica PDF
        </a>
        <Link className="btn" href={row.tipo === 'visita' ? '/visite' : '/referti'}>
          {row.tipo === 'visita' ? '← Tutte le visite' : '← Tutti i referti'}
        </Link>
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
        <div className="card notice"><p>Bozza confermata ✓ — ora puoi scaricare il PDF.</p></div>
      )}
      {!inBozza && p.revisione && typeof p.revisione.quota_modificata === 'number' && (
        <p className="muted small">
          Revisione: il medico ha modificato il <strong>{p.revisione.quota_modificata}%</strong> delle
          parole rispetto alla proposta della catena
          {typeof p.revisione.distanza_parole === 'number' ? ` (${p.revisione.distanza_parole} parole)` : ''}
          {typeof p.revisione.tempo_revisione_s === 'number' ? ` · tempo di revisione ${Math.round(p.revisione.tempo_revisione_s / 60)} min` : ''}
          {typeof p.revisione.flag_totali === 'number' && p.revisione.flag_totali > 0
            ? ` · segnalazioni: ${p.revisione.flag_totali}, accettate senza riascolto ${p.revisione.flag_accettati_senza_riascolto ?? 0}`
            : ''}.
        </p>
      )}
      {searchParams.err === 'testo' && (
        <p className="error">Il testo del referto non può essere vuoto.</p>
      )}
      {searchParams.ok === 'strutturato' && (
        <div className="card notice"><p>
          Proposta AI inserita nel «Testo da confermare»: il dettato è stato
          riorganizzato nel formato standard. Controllala riga per riga prima
          di confermare — i numeri sono verificati identici dal sistema.
        </p></div>
      )}
      {searchParams.err === 'struttura_numeri' && (
        <p className="error">
          Proposta AI scartata: la riorganizzazione avrebbe cambiato dei numeri.
          Il testo resta com&apos;era.
        </p>
      )}
      {searchParams.err === 'struttura_troppo_corto' && (
        <p className="error">
          Proposta AI scartata: il risultato perdeva parte del contenuto.
          Il testo resta com&apos;era.
        </p>
      )}
      {searchParams.err === 'struttura_ai_non_risponde' && (
        <p className="error">
          Il modello AI locale non risponde: riprova tra qualche minuto.
        </p>
      )}
      {searchParams.ok === 'fusione_richiesta' && (
        <div className="card notice"><p>
          Richiesta inviata: la catena sta fondendo il dettato con la lettera
          precedente. Ricarica la pagina tra qualche minuto — la proposta
          comparirà nella scheda «Lettera precedente».
        </p></div>
      )}
      {searchParams.ok === 'fusione_applicata' && (
        <div className="card notice"><p>
          Lettera aggiornata applicata: ora è il testo di partenza della
          revisione. La versione precedente resta salvata nel fascicolo.
        </p></div>
      )}
      {searchParams.err === 'lettera_corta' && (
        <p className="error">La lettera precedente è troppo corta per essere usata (serve il testo completo).</p>
      )}
      {searchParams.err === 'fusione_assente' && (
        <p className="error">Nessuna lettera aggiornata da applicare: chiedi prima la fusione.</p>
      )}

      {inBozza && allarmi.length > 0 && (
        <div className="card ctrl-box">
          <h2>Numeri da riascoltare</h2>
          <p className="muted small">Controlli di trascrizione: un numero insolito per il campo in cui è finito è quasi sempre una cifra sentita male. Nessun giudizio clinico.</p>
          <ul className="ctrl-list">
            {allarmi.map((a, i) => (
              <li key={i}>
                <strong>{String(a.campo ?? 'valore').replaceAll('_', ' ')}: {String(a.valore ?? '?')}</strong>{' '}
                — {fraseAllarme(a)}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {audio && (
        <div className="card">
          <h2>Dettato originale</h2>
          <p className="muted">
            Riascolta l'audio mentre controlli il testo, soprattutto sui punti
            evidenziati: trascina il pallino per tornare a un punto preciso, o
            usa i salti da 10 secondi.
          </p>
          <AudioDettato src={`/api/referti/audio/${audio.id}`} />
        </div>
      )}

      {row.tipo !== 'visita' && (
        <div className="card">
          <h2>Lettera precedente</h2>
          <p className="muted">
            Quando il medico detta gli aggiornamenti («le diagnosi secondarie
            sono quelle dell&apos;altra volta», «prendi l&apos;esame clinico e cambia
            i valori»), la catena può fondere il dettato con l&apos;ultima lettera
            del paziente: le parti invariate restano identiche, il nuovo entra
            al posto giusto. Risultato sempre da rivedere.
          </p>
          {fusione?.stato === 'in_attesa' || fusione?.stato === 'in_lavorazione' ? (
            <p className="muted">
              ⏳ Fusione in corso (richiesta {fusione.richiesta_at ? dataOra(fusione.richiesta_at) : ''}):
              ricarica la pagina tra qualche minuto.
            </p>
          ) : null}
          {fusione?.stato === 'fallita' && (
            <p className="error">
              La fusione non è riuscita ({fusione.errore ?? 'motivo sconosciuto'}): puoi
              riprovare, magari con la lettera completa.
            </p>
          )}
          {fusione?.stato === 'fatta' && fusione.testo_fuso && (
            <div className="ctrl-box" style={{ marginBottom: 14 }}>
              <p><strong>Lettera aggiornata pronta.</strong> Controllala e, se va, applicala:
                diventa il testo di partenza della revisione.</p>
              {fusione.riepilogo && Object.keys(fusione.riepilogo).length > 0 && (
                <p className="muted small">
                  <strong>Cosa è cambiato:</strong>{' '}
                  {[
                    fusione.riepilogo.dettato ? `${fusione.riepilogo.dettato} righe dettate oggi` : null,
                    fusione.riepilogo.aggiornato ? `${fusione.riepilogo.aggiornato} esami aggiornati coi valori nuovi` : null,
                    fusione.riepilogo.misto ? `${fusione.riepilogo.misto} righe che uniscono le due fonti` : null,
                    fusione.riepilogo.precedente ? `${fusione.riepilogo.precedente} righe identiche alla lettera precedente` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              {Array.isArray(fusione.provenienza) && fusione.provenienza.length > 0 && (
                <details open>
                  <summary className="sez-summary">Solo le novità di oggi</summary>
                  <ul style={{ marginTop: 8 }}>
                    {fusione.testo_fuso.split('\n').map((riga, i) => ({ riga, o: fusione.provenienza?.[i] }))
                      .filter(({ riga, o }) => riga.trim() && (o === 'dettato' || o === 'aggiornato' || o === 'misto'))
                      .slice(0, 80)
                      .map(({ riga, o }, i) => <li key={i}>{riga.trim()}{chipProvenienza(o)}</li>)}
                  </ul>
                </details>
              )}
              <details>
                <summary className="sez-summary">Anteprima della lettera aggiornata, riga per riga</summary>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14.5, marginTop: 8 }}>
                  {fusione.testo_fuso.split('\n').map((riga, i) => (
                    <div key={i} style={{ minHeight: '1.2em' }}>
                      {riga}
                      {riga.trim() && Array.isArray(fusione.provenienza) ? chipProvenienza(fusione.provenienza[i]) : null}
                    </div>
                  ))}
                </div>
              </details>
              {inBozza ? (
                <form action={applicaFusione} style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className="btn btn-primary" type="submit">
                    📎 Applica la lettera aggiornata
                  </button>
                </form>
              ) : (
                <p className="muted small">Il referto è già confermato: la proposta resta consultabile, non si applica più.</p>
              )}
            </div>
          )}
          {inBozza && fusione?.stato !== 'in_attesa' && fusione?.stato !== 'in_lavorazione' && (
            <form action={richiediFusione} className="form">
              <input type="hidden" name="id" value={row.id} />
              {precedente ? (
                <p className="muted small">
                  Trovata l&apos;ultima lettera confermata di questo paziente
                  ({dataOra(precedente.reviewed_at)}): è già qui sotto. Se non è
                  quella giusta, sostituiscila incollando il testo corretto.
                </p>
              ) : (
                <p className="muted small">
                  Nessuna lettera precedente nel sistema per questo paziente:
                  incolla qui il testo dell&apos;ultima lettera (da Word).
                </p>
              )}
              <textarea
                name="lettera"
                rows={8}
                defaultValue={fusione?.lettera_precedente ?? precedente?.testo_finale ?? ''}
                placeholder="Incolla qui la lettera precedente completa…"
                style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <div className="form-actions">
                <button className="btn" type="submit">
                  🔁 Aggiorna la lettera precedente con questo dettato
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {Array.isArray(p.note_segreteria) && p.note_segreteria.length > 0 && (
        <div className="card seg-note">
          <details>
          <summary className="sez-summary">
            📋 Note per la segreteria ({p.note_segreteria.length})
            {inBozza && daProcurare.length > 0 && (
              <span className="badge badge-warn" style={{ marginLeft: 10 }}>
                {daProcurare.length === 1 ? '1 cosa non trovata' : `${daProcurare.length} cose non trovate`}
              </span>
            )}
          </summary>
          <p className="muted">
            Dettando, il medico ha rivolto queste frasi a voi: la «segretaria AI» le ha
            tolte dal corpo del referto (le trovi qui, testuali). Se una in realtà è parte
            del referto, ricopiala nel testo qui sotto prima di confermare.
          </p>
          <ul className="seg-note-list">
            {noteRif.map((n, i) => (
              <li key={i}>
                «{n.nota}»
                {n.candidati.length > 0 && (
                  <ul className="seg-cand">
                    {n.candidati.map((c) => (
                      <li key={`${c.tipo}-${c.id}`}>
                        <a
                          href={c.tipo === 'cartella' ? `/api/documents/${c.id}` : `/api/attachments/${c.id}`}
                          target="_blank"
                        >
                          📎 {c.filename}
                        </a>{' '}
                        <span className="tmeta">
                          {c.tipo === 'cartella' ? 'dalla cartella del paziente' : 'dagli allegati'}
                          {c.categoria ? ` · ${c.categoria}` : ''} · {dataOra(c.quando)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {n.riguardaDocumenti && n.candidati.length === 0 && (
                  <span className="badge badge-warn" style={{ marginLeft: 8 }}>non trovato qui</span>
                )}
              </li>
            ))}
          </ul>
          {inBozza && daProcurare.length > 0 && (
            <>
              <h3>❓ Da procurare prima dell&apos;invio</h3>
              <p className="muted">
                Il medico cita questi riferimenti, ma non risultano né nella cartella del
                paziente né tra gli allegati: chiedeteli al medico o recuperateli fuori
                da ReferralFlow (email, archivio).
              </p>
              <ul className="seg-note-list">
                {daProcurare.map((n, i) => (
                  <li key={i}>«{n.nota}»</li>
                ))}
              </ul>
            </>
          )}
          </details>
        </div>
      )}

      {inBozza && audio && parole.length > 0 ? (
        <div className="card">
          <details open>
            <summary className="sez-summary">Testo sincronizzato con l&apos;audio</summary>
            <p className="muted small">
              La stessa bozza, parola per parola sull&apos;audio: utile per riascoltare
              un punto preciso. Il testo su cui lavorare resta quello qui sotto.
            </p>
            <TestoDettato testo={p.testo_corretto ?? ''} parole={parole} ranges={ranges} />
          </details>
        </div>
      ) : !inBozza ? (
        <div className="card">
          <h2>Testo del referto</h2>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {row.testo_finale ?? p.testo_corretto}
          </div>
        </div>
      ) : (
        <div className="card">
          <details open>
            <summary className="sez-summary">Testo con i punti di trascrizione incerta evidenziati</summary>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{nodi}</div>
          </details>
        </div>
      )}

      {inBozza ? (
        <form action={confermaBozza} className="card form">
          <input type="hidden" name="id" value={row.id} />
          <h2>Revisione guidata</h2>
          <RevisioneGuidata
            testo={row.testo_finale ?? p.testo_corretto ?? ''}
            divagazioni={Array.isArray(p.divagazioni) ? p.divagazioni : []}
            frasiDaChiarire={Array.isArray(p.frasi_da_chiarire) ? p.frasi_da_chiarire : []}
            frasiNonSupportate={Array.isArray(p.frasi_non_supportate) ? p.frasi_non_supportate : []}
            riparazioni={Array.isArray(p.riparazioni_applicate) ? p.riparazioni_applicate : []}
            testoStrutturato={typeof p.testo_strutturato === 'string' ? p.testo_strutturato : ''}
            provenienza={
              fusione?.stato === 'fatta' && fusione.testo_fuso && Array.isArray(fusione.provenienza)
                ? fusione.testo_fuso.split('\n').map((riga, i) => [riga, fusione.provenienza?.[i] ?? ''] as [string, string])
                    .filter(([r, o]) => r.trim() && o && o !== 'modello')
                : []
            }
            avvisi={avvisi}
            rischioFrasi={Array.isArray(p.rischio_frasi) ? p.rischio_frasi : []}
            numeri={Array.isArray(p.numeri) ? p.numeri : []}
            letteraPrecedente={fusione?.stato === 'fatta' && typeof fusione.lettera_precedente === 'string' ? fusione.lettera_precedente : ''}
            note={Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n): n is string => typeof n === 'string') : []}
            campi={Object.fromEntries(Object.entries(campi).filter(([, v]) => typeof v === 'string')) as Record<string, string>}
            valoriNumerici={valoriNumerici}
            parole={parole}
          />

          {typeof p.testo_grezzo === 'string' && p.testo_grezzo.trim() !== '' && (
            <details className="grezzo-box">
              <summary>Dettato originale (trascrizione grezza, prima di ogni ritocco)</summary>
              <pre className="grezzo-testo">{p.testo_grezzo}</pre>
            </details>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Conferma il referto</button>
            {/* La proposta parte dal testo COME LO VEDI adesso nella casella,
                comprese le correzioni non ancora confermate. Il lavoro dura
                minuti (modello locale): il componente mostra la percentuale
                interrogando /api/referti/struttura. */}
            <RiorganizzaAI bozzaId={row.id} />
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

      {(divergenze.length > 0 || dubbi.length > 0 || allarmi.length > 0) && (
        <div className="card">
          {/* Il dettaglio tecnico resta disponibile ma chiuso: alla revisione
              quotidiana bastano le evidenziazioni e la scheda «Da controllare». */}
          <details className="cestino">
            <summary className="btn">🔍 Dettagli tecnici delle segnalazioni…</summary>
            {divergenze.length > 0 && (
              <>
                <h3>Le due trascrizioni non coincidono qui</h3>
                <p className="muted">
                  Il sistema non sceglie mai la versione giusta: decidi tu, riascoltando.
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
              </>
            )}
            {dubbi.length > 0 && (
              <>
                <h3>Passaggi segnalati come poco chiari</h3>
                <ul>{dubbi.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            )}
            {allarmi.length > 0 && (
              <>
                <h3>Controlli sui numeri</h3>
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
              </>
            )}
          </details>
        </div>
      )}

      {inBozza && (
        <div className="card">
          {/* Due passaggi apposta: «Scarta» si confonde con «Scarica» e una
              bozza cestinata per sbaglio sembra sparita nel nulla. */}
          <details className="cestino">
            <summary className="btn">🗑 Cestina questa bozza…</summary>
            <p className="muted">
              Da cestinare solo se il dettato è di prova, un doppione o l'audio è
              inutilizzabile. La bozza resta in archivio e si può ripristinare.
              (Per salvare il referto cerchi «Scarica PDF», in alto.)
            </p>
            <form action={scartaBozza}>
              <input type="hidden" name="id" value={row.id} />
              <button className="btn btn-danger" type="submit">Sì, cestina davvero</button>
            </form>
          </details>
        </div>
      )}

      {row.stato === 'scartata' && (
        <div className="card">
          <p className="muted">
            Questa bozza è stata cestinata. Puoi riportarla tra quelle da rivedere,
            oppure eliminarla per sempre (sparisce anche l'audio collegato).
          </p>
          <div className="scarta-azioni">
            <form action={ripristinaBozza}>
              <input type="hidden" name="id" value={row.id} />
              <button className="btn" type="submit">↩ Ripristina la bozza</button>
            </form>
            <details className="cestino">
              <summary className="btn">Elimina definitivamente…</summary>
              <p className="muted">
                Irreversibile: la bozza, il testo trascritto e l&apos;audio collegato
                vengono cancellati per sempre. Nessuno potrà più recuperarli.
              </p>
              <form action={eliminaBozza}>
                <input type="hidden" name="id" value={row.id} />
                <button className="btn btn-danger" type="submit">Sì, elimina per sempre</button>
              </form>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
