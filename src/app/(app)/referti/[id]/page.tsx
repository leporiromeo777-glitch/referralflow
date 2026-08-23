import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ReactNode } from 'react';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { dataOra } from '@/lib/format';
import { confermaBozza, scartaBozza, ripristinaBozza, eliminaBozza, riorganizzaBozza } from '../actions';
import { agganciaRiferimenti } from '@/lib/referti-allegati';
import { AudioDettato } from '../AudioDettato';
import { TestoDettato } from '../TestoDettato';
import { EvidenziatoreTesto } from './EvidenziatoreTesto';

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
  testo_grezzo?: string;
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

// Traduce un allarme numerico in una frase semplice per chi rivede la bozza.
function fraseAllarme(a: Allarme): string {
  const intervallo = a.intervallo ? String(a.intervallo) : '';
  switch (a.stato) {
    case 'fuori':
      return intervallo
        ? `di solito questo valore sta tra ${intervallo}: riascolta l'audio su questo numero`
        : `sembra fuori dai valori consueti: riascolta l'audio su questo numero`;
    case 'limite':
      return intervallo
        ? `è al limite dei valori consueti (${intervallo}): meglio ricontrollarlo`
        : `è al limite dei valori consueti: meglio ricontrollarlo`;
    case 'non_trovato_nel_testo':
      return `questo numero non si ritrova nel testo: controlla che sia giusto`;
    default:
      return `da ricontrollare`;
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

  // Audio collegato (dettato caricato dal drag & drop): riascoltabile qui.
  const [audio] = await query<{ id: string; filename: string }>(
    'select id, filename from referti_audio where bozza_id = $1 and studio_id = $2',
    [params.id, session.studioId]
  );

  const p = row.payload;
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
        <h1>{row.stato === 'confermata' ? 'Referto' : 'Bozza di referto'}</h1>
        <a className="btn btn-primary" href={`/api/referti/docx/${row.id}`}>
          Word in carta intestata
        </a>
        <a className="btn" href={`/api/referti/pdf/${row.id}`} target="_blank">
          Scarica PDF
        </a>
        <Link className="btn" href="/referti">← Tutti i referti</Link>
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

      {inBozza && (
        <div className="card ctrl-box">
          <h2>Da controllare prima di confermare</h2>
          <div className="riepilogo-chips">
            {Array.isArray(p.frasi_non_supportate) && p.frasi_non_supportate.length > 0 && (
              <span className="rchip rchip-rosso">
                {p.frasi_non_supportate.length} frasi senza appoggio nel dettato (numerini rossi)
              </span>
            )}
            {Array.isArray(p.frasi_da_chiarire) && p.frasi_da_chiarire.length > 0 && (
              <span className="rchip rchip-arancio">
                {p.frasi_da_chiarire.length} frasi da chiarire (numerini C1, C2…)
              </span>
            )}
            {Array.isArray(p.divagazioni) && p.divagazioni.length > 0 && (
              <span className="rchip rchip-grigio">
                {p.divagazioni.length} frasi fuori tema spente (barrate: non entrano nel referto)
              </span>
            )}
            {marcati > 0 && (
              <span className="rchip rchip-blu">
                {marcati} punti di trascrizione incerta (da riascoltare)
              </span>
            )}
          </div>
          {(avvisi.length > 0 || allarmi.length > 0) && (
            <ul className="ctrl-list">
              {avvisi.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
              {allarmi.map((a, i) => (
                <li key={i}>
                  <strong>{String(a.campo ?? 'valore').replaceAll('_', ' ')}: {String(a.valore ?? '?')}</strong>{' '}
                  — {fraseAllarme(a)}.
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            Tutto il resto è a posto: correggi nel «Testo da confermare» qui sotto,
            ogni segnalazione ha il suo numerino e la sua spiegazione.
          </p>
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
          <h2>Testo da confermare</h2>
          <p className="muted">
            Entra nel referto solo ciò che è evidenziato: l&apos;AI spegne le divagazioni,
            tu puoi riaccenderle con un clic. Con «Riorganizza» l&apos;AI locale
            propone il testo nel formato standard del rapporto — sezioni, diagnosi
            numerate, esami — senza mai cambiare i numeri; resta una proposta da rivedere.
          </p>
          {Array.isArray(p.frasi_non_supportate) && p.frasi_non_supportate.length > 0 && (
            <div className="evid-box evid-avvocato">
              <p className="muted">
                <strong>Avvocato del diavolo</strong>: un secondo passaggio AI ha riletto
                la bozza contro il dettato originale e non trova appoggio per queste
                citazioni. Nel testo qui sotto le frasi che le contengono sono puntinate
                in rosso col numeretto corrispondente (la citazione può essere più corta
                della frase intera). Verifica col dettato prima di confermarle.
              </p>
              <ol className="ns-lista">
                {p.frasi_non_supportate.map((v, i) => (
                  <li key={i}>
                    <span className="evid-orig">{v.frase}</span>
                    {v.motivo ? <span className="muted"> — {v.motivo}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <EvidenziatoreTesto
            testo={row.testo_finale ?? p.testo_corretto ?? ''}
            divagazioni={Array.isArray(p.divagazioni) ? p.divagazioni : []}
            frasiDaChiarire={Array.isArray(p.frasi_da_chiarire) ? p.frasi_da_chiarire : []}
            frasiNonSupportate={Array.isArray(p.frasi_non_supportate) ? p.frasi_non_supportate : []}
          />

          {typeof p.testo_grezzo === 'string' && p.testo_grezzo.trim() !== '' && (
            <details className="grezzo-box">
              <summary>Dettato originale (trascrizione grezza, prima di ogni ritocco)</summary>
              <p className="muted small">
                Per controllare una frase dubbia: cerca qui cosa è stato trascritto
                davvero, prima del dizionario e delle correzioni AI.
              </p>
              <pre className="grezzo-testo">{p.testo_grezzo}</pre>
            </details>
          )}

          <details className="campi-box" open>
            <summary className="sez-summary">Campi estratti</summary>
            <p className="muted">
              Estratti automaticamente dal testo, mai dedotti: «non indicato» significa
              che nel dettato non c&apos;era. Correggili qui prima di confermare.
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
                  nel riquadro «Da controllare» in cima). Se uno è sbagliato, correggi il testo.
                </p>
                <ul>
                  {Object.entries(valoriNumerici).map(([k, v]) => (
                    <li key={k}><strong>{k.replaceAll('_', ' ')}</strong>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
                  ))}
                </ul>
              </>
            )}
          </details>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Conferma il referto</button>
            {/* Stesso form: la proposta parte dal testo COME LO VEDI adesso
                nella casella, comprese le correzioni non ancora confermate.
                Può richiedere uno-due minuti (modello locale). */}
            <button className="btn" type="submit" formAction={riorganizzaBozza}>
              Riorganizza nel formato standard (AI)
            </button>
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
