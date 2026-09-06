'use client';

import { useEffect, useMemo, useState } from 'react';

// Revisione guidata della bozza (2026-08-25, su richiesta dell'utente: la
// pagina «tutto insieme» era diventata incasinata): un passo alla volta,
// ogni schermata mostra solo un tipo di lavoro. Il testo di lavoro è uno
// solo (le frasi), condiviso da tutti i passi; la casella finale (passo di
// rilettura) è quella che viene confermata. Gli input dei campi estratti
// restano montati in ogni passo (nascosti via CSS) così la conferma invia
// sempre tutto.

type FraseDaChiarire = { frase: string; proposta: string };
type FraseNonSupportata = { frase: string; motivo: string };
type Riparazione = { da: string; a: string };

function spezzaInFrasi(testo: string): string[] {
  const pezzi: string[] = [];
  let corrente = '';
  for (const riga of testo.replace(/\r\n/g, '\n').split('\n')) {
    const frasi = riga.split(/(?<=[.!?;])\s+/);
    for (const f of frasi) {
      corrente = corrente ? `${corrente} ${f}` : f;
      if (/[.!?;]["»)]?$/.test(f.trim())) {
        pezzi.push(corrente);
        corrente = '';
      }
    }
    if (corrente) {
      pezzi.push(corrente);
      corrente = '';
    }
  }
  return pezzi.filter((p) => p.trim());
}

function normalizza(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
}

export function RevisioneGuidata({
  testo,
  divagazioni,
  frasiDaChiarire,
  frasiNonSupportate,
  note,
  campi,
  valoriNumerici,
  parole = [],
  riparazioni = [],
  testoStrutturato = '',
  provenienza = [],
  avvisi = [],
  rischioFrasi = [],
  numeri = [],
  frasiOmesse = [],
  variazioni = [],
  letteraPrecedente = '',
}: {
  testo: string;
  divagazioni: string[];
  frasiDaChiarire: FraseDaChiarire[];
  frasiNonSupportate: FraseNonSupportata[];
  note: string[];
  campi: Record<string, string>;
  valoriNumerici: Record<string, unknown> | null;
  parole?: [string, number][];
  riparazioni?: Riparazione[];
  testoStrutturato?: string;
  provenienza?: [string, string][];
  avvisi?: string[];
  rischioFrasi?: { frase: string; punteggio: number; motivi?: string[] }[];
  numeri?: { valore: string; unita?: string; frase?: number | null; secondo?: number | null; confermato?: boolean | null }[];
  frasiOmesse?: { frase: string; secondo?: number | null; cifre?: boolean; farmaco?: boolean; copertura?: number | null }[];
  variazioni?: { misura: string; prima: string; dopo: string; grande?: boolean }[];
  letteraPrecedente?: string;
}) {
  const frasiIniziali = useMemo(() => spezzaInFrasi(testo), [testo]);

  // Provenienza (lettera incrementale): per ogni frase del wizard, da dove
  // viene — dettata oggi, copiata dalla lettera precedente, aggiornata. Le
  // righe della lettera fusa possono contenere più frasi: si cerca la riga
  // che CONTIENE la frase (frasi corte escluse per non sbagliare aggancio).
  const provNorm = useMemo(
    () => provenienza.map(([r, o]) => [normalizza(r), o] as [string, string]),
    [provenienza]
  );
  const origineDi = (frase: string): string | null => {
    if (provNorm.length === 0) return null;
    const n = normalizza(frase);
    if (n.length < 15) return null;
    const hit = provNorm.find(([r]) => r === n || r.includes(n));
    return hit ? hit[1] : null;
  };
  const ETICHETTE: Record<string, { t: string; fg: string; bg: string }> = {
    dettato: { t: 'dettato oggi', fg: '#0d5c48', bg: '#e3ece8' },
    precedente: { t: 'lettera precedente', fg: '#2c5c86', bg: '#e0e8f0' },
    aggiornato: { t: 'aggiornato', fg: '#8a5d0c', bg: '#f3e9d6' },
    misto: { t: 'precedente + oggi', fg: '#5a4a86', bg: '#e9e4f2' },
  };
  // Un badge di provenienza deve APRIRE qualcosa (la ricerca del 2026 è
  // netta: le citazioni aumentano la fiducia anche quando sono casuali):
  // «dettato oggi» riascolta il punto, «lettera precedente» mostra la riga
  // d'origine. Mai badge decorativi.
  const [rigaPrec, setRigaPrec] = useState<{ frase: string; riga: string } | null>(null);
  const rigaPrecedenteDi = (frase: string): string | null => {
    if (!letteraPrecedente) return null;
    const n = normalizza(frase);
    if (n.length < 15) return null;
    const righe = letteraPrecedente.replace(/\r/g, '').split('\n');
    const hit = righe.find((r) => {
      const nr = normalizza(r);
      return nr.length >= 15 && (nr.includes(n) || n.includes(nr));
    });
    return hit ? hit.trim() : null;
  };
  const chipOrigine = (frase: string) => {
    const o = origineDi(frase);
    const v = o ? ETICHETTE[o] : undefined;
    if (!v) return null;
    const stile = {
      fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' as const,
      color: v.fg, background: v.bg, borderRadius: 4, padding: '2px 6px', marginLeft: 8,
      whiteSpace: 'nowrap' as const, verticalAlign: 'middle', border: 0, cursor: 'pointer',
    };
    if (o === 'precedente') {
      const riga = rigaPrecedenteDi(frase);
      return (
        <button type="button" style={stile} title="Mostra la riga della lettera precedente"
          onClick={() => setRigaPrec(rigaPrec?.frase === frase ? null : { frase, riga: riga ?? '' })}>
          {v.t} ↗
        </button>
      );
    }
    const s = tempoDiFrase(frase);
    if (s === null) return <span style={{ ...stile, cursor: 'default' }}>{v.t}</span>;
    return (
      <button type="button" style={stile} title={`Riascolta qui (${mmss(s)})`}
        onClick={() => riascolta(s, /\d/.test(frase))}>
        {v.t} 🎧
      </button>
    );
  };
  const [frasi, setFrasi] = useState<string[]>(frasiIniziali);

  const spenteIniziali = useMemo(() => {
    const divNorm = divagazioni.map(normalizza).filter((d) => d.length >= 8);
    const s = new Set<number>();
    frasiIniziali.forEach((f, i) => {
      if (/\d/.test(f)) return; // regola d'oro: le frasi con cifre mai spente
      const n = normalizza(f);
      if (n.length >= 8 && divNorm.some((d) => d.includes(n) || n.includes(d))) s.add(i);
    });
    return s;
  }, [frasiIniziali, divagazioni]);
  const [spente, setSpente] = useState<Set<number>>(spenteIniziali);

  // Abbinamento segnalazioni → indice frase (sulla frase INIZIALE: le
  // modifiche non spostano gli indici).
  const trovaIndice = (citazione: string) => {
    const c = normalizza(citazione);
    if (c.length < 8) return -1;
    return frasiIniziali.findIndex((f) => {
      const n = normalizza(f);
      return n.includes(c) || c.includes(n);
    });
  };
  const rosse = useMemo(
    () => frasiNonSupportate.map((v, k) => ({ ...v, k, idx: trovaIndice(v.frase) })),
    [frasiNonSupportate] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const arancioni = useMemo(
    () => frasiDaChiarire.map((v, k) => ({ ...v, k, idx: trovaIndice(v.frase) })),
    [frasiDaChiarire] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // «Riascolta qui»: trova il momento dell'audio in cui la frase viene
  // detta, scorrendo i tempi parola-per-parola (già ritarati sulle ancore
  // dell'audio originale) alla ricerca della finestra che somiglia di più
  // all'attacco della frase.
  const paroleNorm = useMemo(
    () => parole.map(([w, s]) => [normalizza(w), s] as [string, number]),
    [parole]
  );
  const tempoDiFrase = (frase: string): number | null => {
    if (paroleNorm.length === 0) return null;
    const cerca = normalizza(frase).split(' ').filter((w) => w.length >= 2).slice(0, 8);
    if (cerca.length === 0) return null;
    // Frasi corte (1-2 parole, tipiche delle correzioni singole): serve la
    // corrispondenza esatta e consecutiva — prima occorrenza. Meglio un
    // riascolto sulla prima occorrenza che nessun riascolto.
    if (cerca.length < 3) {
      for (let i = 0; i <= paroleNorm.length - cerca.length; i++) {
        let tutte = true;
        for (let j = 0; j < cerca.length; j++) {
          if (paroleNorm[i + j][0] !== cerca[j]) { tutte = false; break; }
        }
        if (tutte) return paroleNorm[i][1];
      }
      return null;
    }
    let migliore = -1;
    let punteggio = 0;
    for (let i = 0; i <= paroleNorm.length - cerca.length; i++) {
      let m = 0;
      for (let j = 0; j < cerca.length; j++) {
        if (paroleNorm[i + j][0] === cerca[j]) m++;
      }
      if (m > punteggio) {
        punteggio = m;
        migliore = i;
      }
    }
    if (migliore < 0 || punteggio < Math.max(3, Math.ceil(cerca.length * 0.6))) return null;
    return paroleNorm[migliore][1];
  };
  // Riascolto a 1,5x a scelta (fino a 2x la comprensione non cala), ma
  // SEMPRE a 1x sui passaggi con cifre: lì l'orecchio deve essere lento.
  const [veloce, setVeloce] = useState(false);
  const riascolta = (secondi: number, conCifre = false) => {
    const a = document.getElementById('audio-dettato') as HTMLAudioElement | null;
    if (!a) return;
    a.playbackRate = veloce && !conCifre ? 1.5 : 1;
    a.currentTime = Math.max(0, secondi - 1.5);
    void a.play().catch(() => {});
    setRiascoltiFatti((n) => n + 1);
  };
  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const bottoneRiascolta = (frase: string) => {
    const s = tempoDiFrase(frase);
    if (s === null) return null;
    const cifre = /\d/.test(frase);
    return (
      <button type="button" className="btn" title={cifre ? 'Riascolto a 1x: ci sono numeri' : undefined}
        onClick={() => riascolta(s, cifre)}>
        🎧 Riascolta qui ({mmss(s)}){veloce && cifre ? ' · 1x' : ''}
      </button>
    );
  };

  const [fatte, setFatte] = useState<Set<string>>(new Set());
  // Telemetria della revisione: quando è iniziata, quante segnalazioni sono
  // state chiuse e quante senza aver riascoltato nulla nel frattempo.
  const [inizioRevisione] = useState(() => Date.now());
  const [riascoltiFatti, setRiascoltiFatti] = useState(0);
  const [chiuseSenzaRiascolto, setChiuseSenzaRiascolto] = useState(0);
  const [chiuse, setChiuse] = useState(0);
  const segna = (id: string) => {
    setFatte((prev) => {
      if (prev.has(id)) return prev;
      setChiuse((c) => c + 1);
      if (riascoltiFatti === 0) setChiuseSenzaRiascolto((c) => c + 1);
      return new Set(prev).add(id);
    });
  };

  const [inModifica, setInModifica] = useState<number | null>(null);
  const [bozzaModifica, setBozzaModifica] = useState('');
  // Frasi già ritoccate a mano: badge verde sulla scheda, così il
  // salvataggio si VEDE (il testone evidenziato in cima alla pagina è la
  // fotografia della bozza originale e cambia solo alla conferma).
  const [modificate, setModificate] = useState<Set<number>>(new Set());

  const componi = (fr: string[], esc: Set<number>) =>
    fr.filter((_, i) => !esc.has(i)).join('\n');
  const [testoLibero, setTestoLibero] = useState<string | null>(null);
  const testoAttuale = testoLibero ?? componi(frasi, spente);

  function salvaModifica(i: number) {
    const vecchia = frasi[i];
    setFrasi((prev) => prev.map((f, j) => (j === i ? bozzaModifica : f)));
    // Se la rilettura finale è già stata toccata a mano, comanda lei: la
    // stessa modifica va applicata anche lì, altrimenti andrebbe persa.
    if (testoLibero !== null && vecchia.trim()) {
      setTestoLibero(testoLibero.replace(vecchia, bozzaModifica));
    }
    setModificate((prev) => new Set(prev).add(i));
    setInModifica(null);
  }
  function riaccendi(i: number) {
    setSpente((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }
  function inserisciNota(nota: string, id: string) {
    if (testoLibero !== null) setTestoLibero(testoLibero + '\n' + nota);
    else setFrasi((prev) => [...prev, nota]);
    segna(id);
  }

  // Annulla una correzione automatica: la macchina l'aveva applicata
  // ovunque, l'annullamento la ripristina ovunque (parola per parola).
  function annullaRiparazione(v: Riparazione, id: string) {
    setFrasi((prev) => prev.map((f) => f.split(v.a).join(v.da)));
    if (testoLibero !== null) setTestoLibero(testoLibero.split(v.a).join(v.da));
    segna(id);
  }
  const fraseConRiparazione = (v: Riparazione) =>
    frasiIniziali.find((f) => f.includes(v.a)) ?? null;

  // Passi presenti solo se hanno contenuto (i campi e la rilettura sempre).
  // Triage a due livelli (ricerca 2026: sotto il 70% di affidabilità un
  // aiuto peggiora la prestazione, e se i rossi sono quasi sempre falsi il
  // rosso vero passa): PRIMA solo ciò che può fare danno — frasi non
  // supportate dal dettato, avvisi su cifre e farmaci — poi il resto. Ogni
  // lista mostra al massimo 7 voci, le altre a richiesta.
  const passi: { chiave: string; titolo: string; conta?: number }[] = [];
  // Frasi a rischio dalla pipeline (punteggio ≥ 8) non già mostrate tra le rosse.
  const aRischio = rischioFrasi
    .filter((r) => r.punteggio >= 8)
    .filter((r) => !rosse.some((v) => normalizza(v.frase) === normalizza(r.frase)))
    .map((r, k) => ({ ...r, k, idx: trovaIndice(r.frase) }));
  const omesseGravi = frasiOmesse.filter((o) => o.cifre || o.farmaco);
  const omesseAltre = frasiOmesse.filter((o) => !(o.cifre || o.farmaco));
  // Cambiamenti grandi tra una visita e l'altra (dalla fusione): o sono veri
  // o è una cifra sentita male → nel primo passo, con riascolto.
  const grandi = variazioni.filter((v) => v.grande).map((v, k) => {
    const frase = frasiIniziali.find((f) => f.includes(v.dopo) && normalizza(f).includes(normalizza(v.misura).split(' ')[0])) ?? frasiIniziali.find((f) => f.includes(v.dopo)) ?? '';
    return { ...v, k, frase };
  });
  if (rosse.length + avvisi.length + aRischio.length + omesseGravi.length + grandi.length > 0)
    passi.push({ chiave: 'subito', titolo: 'Da controllare subito', conta: rosse.length + avvisi.length + aRischio.length + omesseGravi.length + grandi.length });
  if (arancioni.length > 0)
    passi.push({ chiave: 'arancioni', titolo: 'Frasi da chiarire', conta: arancioni.length });
  if (spenteIniziali.size > 0)
    passi.push({ chiave: 'spente', titolo: 'Frasi spente dall’AI', conta: spenteIniziali.size });
  if (riparazioni.length > 0)
    passi.push({ chiave: 'ripar', titolo: 'Correzioni automatiche', conta: riparazioni.length });
  if (note.length > 0)
    passi.push({ chiave: 'note', titolo: 'Note per la segreteria', conta: note.length });
  if (Object.keys(campi).filter((k) => typeof campi[k] === 'string').length > 0)
    passi.push({ chiave: 'campi', titolo: 'Campi estratti' });
  passi.push({ chiave: 'fine', titolo: 'Rileggi e conferma' });

  const [passo, setPasso] = useState(0);
  const attivo = passi[passo].chiave;
  const ultimo = passo === passi.length - 1;

  // Ripresa dal passo lasciato (per questa bozza, in questo browser).
  const chiaveRipresa = typeof window !== 'undefined' ? `rg-passo:${window.location.pathname}` : '';
  useEffect(() => {
    try {
      const v = chiaveRipresa ? window.localStorage.getItem(chiaveRipresa) : null;
      const n = v === null ? NaN : Number(v);
      if (Number.isInteger(n) && n > 0 && n < passi.length) setPasso(n);
    } catch { /* niente memoria locale: si parte dal primo passo */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { if (chiaveRipresa) window.localStorage.setItem(chiaveRipresa, String(passo)); } catch { /* ignorato */ }
  }, [passo, chiaveRipresa]);

  // Tasti: ← → cambiano passo (non mentre si scrive in un campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' && passo < passi.length - 1) { e.preventDefault(); setPasso(passo + 1); }
      if (e.key === 'ArrowLeft' && passo > 0) { e.preventDefault(); setPasso(passo - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [passo, passi.length]);

  const LIMITE = 7;
  const [estese, setEstese] = useState<Set<string>>(new Set());
  const limita = <T,>(chiave: string, lista: T[]): T[] =>
    estese.has(chiave) ? lista : lista.slice(0, LIMITE);
  const bottoneAltre = (chiave: string, totale: number) =>
    totale > LIMITE && !estese.has(chiave) ? (
      <button type="button" className="btn" onClick={() => setEstese((prev) => new Set(prev).add(chiave))}>
        Mostra le altre {totale - LIMITE}
      </button>
    ) : null;

  const cardFrase = (idx: number) =>
    idx >= 0 ? (
      inModifica === idx ? (
        <div className="rg-modifica">
          <textarea
            rows={3}
            value={bozzaModifica}
            onChange={(e) => setBozzaModifica(e.target.value)}
            style={{ width: '100%' }}
          />
          <div className="rg-azioni">
            <button type="button" className="btn btn-primary" onClick={() => salvaModifica(idx)}>
              Salva la frase
            </button>
            <button type="button" className="btn" onClick={() => setInModifica(null)}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="rg-frase">
            {frasi[idx]}
            {chipOrigine(frasiIniziali[idx])}
            {modificate.has(idx) && (
              <span style={{ color: 'var(--cta)', fontWeight: 600, marginLeft: 8 }}>
                ✓ frase aggiornata (entra così nel referto)
              </span>
            )}
          </p>
          {rigaPrec?.frase === frasiIniziali[idx] && (
            <p className="rg-motivo">
              {rigaPrec.riga ? <>Dalla lettera precedente: «{rigaPrec.riga}»</> : 'Riga d’origine non ritrovata nella lettera precedente.'}
            </p>
          )}
        </div>
      )
    ) : (
      <div>
        <p className="muted small">
          (La frase non si aggancia più al testo — probabilmente l&apos;hai già
          modificata.)
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => setPasso(passi.length - 1)}
        >
          ✏️ Correggi nella rilettura finale
        </button>
      </div>
    );

  return (
    <div className="rg">
      <div className="rg-testata">
        <div className="rg-passi">
          {passi.map((p, i) => (
            <button
              key={p.chiave}
              type="button"
              className={`rg-tab${i === passo ? ' attivo' : ''}${i < passo ? ' fatto' : ''}`}
              onClick={() => setPasso(i)}
            >
              <span className="rg-tab-num">{i + 1}</span> {p.titolo}
              {typeof p.conta === 'number' ? ` (${p.conta})` : ''}
            </button>
          ))}
        </div>
        <p className="muted small">
          Passo {passo + 1} di {passi.length} — sistemi una cosa alla volta; alla fine
          rileggi tutto e confermi. Niente si salva finché non confermi. Tasti ← → per
          cambiare passo.
          {parole.length > 0 && (
            <>
              {' '}
              <button type="button" className={`rg-tab${veloce ? ' attivo' : ''}`} style={{ marginLeft: 6 }}
                title="Riascolto più veloce; sui passaggi con numeri resta a 1x"
                onClick={() => setVeloce(!veloce)}>
                ⏩ Riascolto 1,5x {veloce ? 'acceso' : 'spento'}
              </button>
            </>
          )}
        </p>
      </div>

      {attivo === 'ripar' && (
        <div className="rg-corpo">
          <p className="muted">
            Tutto quello che la macchina ha corretto da sola nel testo (parola
            storpiata → forma scelta). Le guardie controllano suono e numeri, ma
            il merito medico lo giudichi tu: se una correzione è sbagliata,
            annullala e torna la parola dettata.
          </p>
          {limita('ripar', riparazioni.map((v, i) => ({ v, i }))).map(({ v, i }) => {
            const contesto = fraseConRiparazione(v);
            // Ancora sulle frasi INIZIALI (immutabili) e ricerca ELASTICA
            // (senza maiuscole/punteggiatura): il confronto rigido perdeva
            // l'aggancio per una virgola toccata dalla bella copia e il ✏️
            // spariva proprio dove serviva.
            const na = normalizza(v.a);
            const nda = normalizza(v.da);
            const idxR = frasiIniziali.findIndex((f) => {
              const n = ` ${normalizza(f)} `;
              return (na.length >= 3 && n.includes(` ${na} `))
                || (nda.length >= 3 && n.includes(` ${nda} `))
                || f.includes(v.a) || f.includes(v.da);
            });
            return (
              <div key={i} className={`rg-item${fatte.has(`p${i}`) ? ' rg-fatta' : ''}`}>
                <p className="rg-frase">
                  <s className="muted">{v.da}</s> → <strong>{v.a}</strong>
                </p>
                {idxR >= 0 && inModifica === idxR
                  ? cardFrase(idxR)
                  : idxR >= 0
                    ? (
                      <p className="rg-motivo">
                        …{frasi[idxR]}…
                        {modificate.has(idxR) && (
                          <span style={{ color: 'var(--cta)', fontWeight: 600, marginLeft: 8 }}>
                            ✓ frase aggiornata
                          </span>
                        )}
                      </p>
                    )
                    : contesto && <p className="rg-motivo">…{contesto}…</p>}
                {!fatte.has(`p${i}`) && (
                  <div className="rg-azioni">
                    {/* Aggancio a cascata: contesto intero → parola corretta
                        → parola dettata. Così il 🎧 c'è quasi sempre. */}
                    {(contesto && bottoneRiascolta(contesto))
                      || bottoneRiascolta(v.a)
                      || bottoneRiascolta(v.da)}
                    {idxR >= 0 && inModifica !== idxR && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setInModifica(idxR);
                          setBozzaModifica(frasi[idxR]);
                        }}
                      >
                        ✏️ Correggi la frase
                      </button>
                    )}
                    {idxR < 0 && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setPasso(passi.length - 1)}
                      >
                        ✏️ Correggi nella rilettura finale
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => annullaRiparazione(v, `p${i}`)}
                    >
                      ↩︎ Annulla (ripristina «{v.da}»)
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => segna(`p${i}`)}>
                      ✓ Corretta
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {bottoneAltre('ripar', riparazioni.length)}
        </div>
      )}

      {attivo === 'subito' && (
        <div className="rg-corpo">
          <p className="muted">
            Solo ciò che può fare danno: avvisi su cifre e farmaci, e frasi che
            l&apos;avvocato del diavolo non trova nel dettato. Riascolta il punto e
            correggi, oppure conferma che va bene così.
          </p>
          {limita('avvisi', avvisi.map((a, i) => ({ a, i }))).map(({ a, i }) => (
            <div key={`a${i}`} className={`rg-item rg-rossa${fatte.has(`a${i}`) ? ' rg-fatta' : ''}`}>
              <p className="rg-frase">⚠️ {a}</p>
              {!fatte.has(`a${i}`) && (
                <div className="rg-azioni">
                  {(a.match(/«([^»]+)»/g) ?? []).slice(0, 2).map((m) => bottoneRiascolta(m.replace(/[«»]/g, ''))).find(Boolean) ?? null}
                  <button type="button" className="btn" onClick={() => setPasso(passi.length - 1)}>
                    ✏️ Correggi nella rilettura finale
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`a${i}`)}>
                    ✓ Controllato
                  </button>
                </div>
              )}
            </div>
          ))}
          {bottoneAltre('avvisi', avvisi.length)}
          {limita('rosse', rosse).map((v) => (
            <div key={v.k} className={`rg-item rg-rossa${fatte.has(`r${v.k}`) ? ' rg-fatta' : ''}`}>
              {cardFrase(v.idx)}
              <p className="rg-motivo">→ {v.motivo || 'non trovata nel dettato'}</p>
              {!fatte.has(`r${v.k}`) && (
                <div className="rg-azioni">
                  {bottoneRiascolta(v.idx >= 0 ? frasiIniziali[v.idx] : v.frase)}
                  {v.idx >= 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setInModifica(v.idx);
                        setBozzaModifica(frasi[v.idx]);
                      }}
                    >
                      ✏️ Correggi la frase
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`r${v.k}`)}>
                    ✓ Va bene così
                  </button>
                </div>
              )}
            </div>
          ))}
          {bottoneAltre('rosse', rosse.length)}
          {aRischio.length > 0 && (
            <p className="muted small" style={{ marginTop: 12 }}>
              Frasi a rischio secondo la catena (numeri, negazioni, lateralità, farmaci,
              disaccordo tra i due motori): ognuna dice perché la vedi.
            </p>
          )}
          {limita('rischio', aRischio).map((v) => (
            <div key={`k${v.k}`} className={`rg-item rg-arancione${fatte.has(`k${v.k}`) ? ' rg-fatta' : ''}`}>
              {cardFrase(v.idx)}
              <p className="rg-motivo">
                {(v.motivi ?? []).map((m, j) => (
                  <span key={j} className="rg-tab" style={{ marginRight: 6, fontSize: '0.8em', padding: '2px 9px' }}>{m}</span>
                ))}
              </p>
              {!fatte.has(`k${v.k}`) && (
                <div className="rg-azioni">
                  {bottoneRiascolta(v.idx >= 0 ? frasiIniziali[v.idx] : v.frase)}
                  {v.idx >= 0 && (
                    <button type="button" className="btn" onClick={() => { setInModifica(v.idx); setBozzaModifica(frasi[v.idx]); }}>
                      ✏️ Correggi la frase
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`k${v.k}`)}>
                    ✓ Va bene così
                  </button>
                </div>
              )}
            </div>
          ))}
          {bottoneAltre('rischio', aRischio.length)}
          {grandi.map((v) => (
            <div key={`g${v.k}`} className={`rg-item rg-rossa${fatte.has(`g${v.k}`) ? ' rg-fatta' : ''}`}>
              <p className="rg-frase">
                <strong>{v.misura}</strong>: era {v.prima}, oggi {v.dopo}
                <span className="rg-tab" style={{ marginLeft: 8, fontSize: '0.8em', padding: '2px 9px' }}>cambiamento grande tra le visite</span>
              </p>
              {v.frase && <p className="rg-motivo">…{v.frase}…</p>}
              {!fatte.has(`g${v.k}`) && (
                <div className="rg-azioni">
                  {v.frase ? bottoneRiascolta(v.frase) : null}
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`g${v.k}`)}>
                    ✓ È corretto così
                  </button>
                </div>
              )}
            </div>
          ))}
          {frasiOmesse.length > 0 && (
            <p className="muted small" style={{ marginTop: 12 }}>
              <strong>Nel dettato ma non nel referto</strong> ({frasiOmesse.length}): passaggi della
              trascrizione grezza che non si ritrovano né nel testo né nelle note. Riascolta: se
              serve, inseriscilo; se era una divagazione o un&apos;istruzione alla segreteria, chiudi.
            </p>
          )}
          {limita('omesse', [...omesseGravi, ...omesseAltre].map((o, k) => ({ ...o, k }))).map((o) => (
            <div key={`o${o.k}`} className={`rg-item${o.cifre || o.farmaco ? ' rg-rossa' : ''}${fatte.has(`o${o.k}`) ? ' rg-fatta' : ''}`}>
              <p className="rg-frase">«{o.frase}»
                {o.cifre && <span className="rg-tab" style={{ marginLeft: 8, fontSize: '0.8em', padding: '2px 9px' }}>numeri</span>}
                {o.farmaco && <span className="rg-tab" style={{ marginLeft: 6, fontSize: '0.8em', padding: '2px 9px' }}>farmaco</span>}
              </p>
              {!fatte.has(`o${o.k}`) && (
                <div className="rg-azioni">
                  {typeof o.secondo === 'number' && (
                    <button type="button" className="btn" onClick={() => riascolta(o.secondo as number, true)}>
                      🎧 Riascolta qui ({mmss(o.secondo)})
                    </button>
                  )}
                  <button type="button" className="btn" onClick={() => inserisciNota(o.frase, `o${o.k}`)}>
                    ↩︎ Inserisci nel testo
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`o${o.k}`)}>
                    ✓ Non serve nel referto
                  </button>
                </div>
              )}
            </div>
          ))}
          {bottoneAltre('omesse', frasiOmesse.length)}
          {numeri.some((n) => n.confermato === false) && (
            <details style={{ marginTop: 10 }}>
              <summary className="sez-summary">
                Numeri non confermati dal secondo orecchio ({numeri.filter((n) => n.confermato === false).length})
              </summary>
              <ul style={{ marginTop: 8 }}>
                {numeri.filter((n) => n.confermato === false).slice(0, 30).map((n, j) => (
                  <li key={j}>
                    <strong>{n.valore}{n.unita ? ` ${n.unita}` : ''}</strong>
                    {typeof n.frase === 'number' && frasiIniziali[n.frase] ? <> — {frasiIniziali[n.frase].slice(0, 90)}{frasiIniziali[n.frase].length > 90 ? '…' : ''}</> : null}
                    {typeof n.secondo === 'number' && (
                      <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={() => riascolta(n.secondo as number, true)}>
                        🎧 {mmss(n.secondo)}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {attivo === 'arancioni' && (
        <div className="rg-corpo">
          <p className="muted">
            Per l&apos;AI queste frasi non hanno senso in italiano corretto. Dove c&apos;è
            una proposta dal glossario, applicala con un clic; altrimenti correggi o
            lascia com&apos;è.
          </p>
          {limita('arancioni', arancioni).map((v) => (
            <div key={v.k} className={`rg-item rg-arancione${fatte.has(`c${v.k}`) ? ' rg-fatta' : ''}`}>
              {cardFrase(v.idx)}
              {v.proposta && !fatte.has(`c${v.k}`) && (
                <p className="rg-motivo">Proposta: <strong>{v.proposta}</strong></p>
              )}
              {!fatte.has(`c${v.k}`) && (
                <div className="rg-azioni">
                  {bottoneRiascolta(v.idx >= 0 ? frasiIniziali[v.idx] : v.frase)}
                  {v.proposta && v.idx >= 0 && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setFrasi((prev) => prev.map((f, j) => (j === v.idx ? v.proposta : f)));
                        segna(`c${v.k}`);
                      }}
                    >
                      Applica la proposta
                    </button>
                  )}
                  {v.idx >= 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setInModifica(v.idx);
                        setBozzaModifica(frasi[v.idx]);
                      }}
                    >
                      ✏️ Correggi
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`c${v.k}`)}>
                    ✓ Va bene così
                  </button>
                </div>
              )}
            </div>
          ))}
          {bottoneAltre('arancioni', arancioni.length)}
        </div>
      )}

      {attivo === 'spente' && (
        <div className="rg-corpo">
          <p className="muted">
            L&apos;AI ha spento queste frasi come fuori tema: NON entreranno nel referto.
            Se una in realtà serve, riaccendila.
          </p>
          {limita('spente', [...spenteIniziali]).map((i) => (
            <div key={i} className={`rg-item${spente.has(i) ? '' : ' rg-fatta'}`}>
              {inModifica === i ? (
                cardFrase(i)
              ) : (
                <p className={`rg-frase${spente.has(i) ? ' rg-spenta' : ''}`}>{frasi[i]}</p>
              )}
              <div className="rg-azioni">
                {bottoneRiascolta(frasiIniziali[i])}
                <button type="button" className="btn" onClick={() => riaccendi(i)}>
                  {spente.has(i) ? '💡 Riaccendi (entra nel referto)' : 'Rispegni'}
                </button>
                {inModifica !== i && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      // Correggerla implica volerla nel referto: si riaccende.
                      if (spente.has(i)) riaccendi(i);
                      setInModifica(i);
                      setBozzaModifica(frasi[i]);
                    }}
                  >
                    ✏️ Correggi
                  </button>
                )}
              </div>
            </div>
          ))}
          {bottoneAltre('spente', spenteIniziali.size)}
        </div>
      )}

      {attivo === 'note' && (
        <div className="rg-corpo">
          <p className="muted">
            Frasi che il medico ha rivolto a voi: restano qui come promemoria. Se una
            in realtà è parte del referto, inseriscila nel testo.
          </p>
          {note.map((n, i) => (
            <div key={i} className={`rg-item${fatte.has(`n${i}`) ? ' rg-fatta' : ''}`}>
              <p className="rg-frase">«{n}»</p>
              {!fatte.has(`n${i}`) && (
                <div className="rg-azioni">
                  <button type="button" className="btn" onClick={() => inserisciNota(n, `n${i}`)}>
                    ↩︎ Inserisci nel testo
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`n${i}`)}>
                    ✓ È solo per noi
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* I campi restano montati sempre (il form li invia alla conferma);
          visibili solo nel loro passo. */}
      <div className="rg-corpo" style={{ display: attivo === 'campi' ? undefined : 'none' }}>
        <p className="muted">
          Estratti automaticamente, mai dedotti («non indicato» = nel dettato non
          c&apos;era). Correggi qui prima di confermare.
        </p>
        <input type="hidden" name="tempo_revisione_s" value={Math.round((Date.now() - inizioRevisione) / 1000)} readOnly />
        <input type="hidden" name="flag_totali" value={chiuse} readOnly />
        <input type="hidden" name="flag_accettati_senza_riascolto" value={chiuseSenzaRiascolto} readOnly />
        <div className="grid2">
          {Object.entries(campi)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => (
              <label key={k}>
                {k.replaceAll('_', ' ')}
                <input name={`campo__${k}`} maxLength={2000} defaultValue={String(v)} />
              </label>
            ))}
        </div>
        {valoriNumerici && Object.keys(valoriNumerici).length > 0 && (
          <>
            <h3>Valori numerici rilevati</h3>
            <ul>
              {Object.entries(valoriNumerici).map(([k, v]) => (
                <li key={k}>
                  <strong>{k.replaceAll('_', ' ')}</strong>:{' '}
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* La casella del testo resta montata sempre: è ciò che viene confermato. */}
      <div className="rg-corpo" style={{ display: attivo === 'fine' ? undefined : 'none' }}>
        <p className="muted">
          Il referto come uscirà, con tutte le correzioni dei passi precedenti.
          Ultima rilettura: puoi ancora ritoccare a mano qui.
        </p>
        {testoStrutturato && (
          <div className="rg-azioni" style={{ marginBottom: 10 }}>
            {/* La proposta è pronta dalla catena (fase «struttura») ed è
                fatta delle STESSE frasi del testo: al clic ci si innestano
                le correzioni fatte nei passi (frasi modificate e spente),
                così il lavoro di revisione non va mai perso. */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                let s = testoStrutturato;
                frasiIniziali.forEach((orig, i) => {
                  if (spente.has(i)) {
                    s = s.replace(orig, '');
                  } else if (frasi[i] !== orig) {
                    s = s.replace(orig, frasi[i]);
                  }
                });
                setTestoLibero(s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'));
              }}
            >
              📐 Applica il formato standard (con le tue correzioni)
            </button>
            {testoLibero !== null && (
              <button type="button" className="btn" onClick={() => setTestoLibero(null)}>
                ↩︎ Torna al testo dei passi
              </button>
            )}
          </div>
        )}
        <textarea
          name="testo"
          rows={18}
          required
          value={testoAttuale}
          onChange={(e) => setTestoLibero(e.target.value)}
          style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        {testoLibero !== null && (
          <p className="muted small">
            Hai ritoccato a mano: da qui in poi i passi precedenti non riscrivono più
            la casella.
          </p>
        )}
      </div>

      <div className="rg-nav">
        <button type="button" className="btn" disabled={passo === 0} title="Tasto ←" onClick={() => setPasso(passo - 1)}>
          ← Indietro
        </button>
        {!ultimo ? (
          <button type="button" className="btn btn-primary" title="Tasto →" onClick={() => setPasso(passo + 1)}>
            Avanti →
          </button>
        ) : (
          <span className="muted small">Qui sotto: conferma o riorganizza.</span>
        )}
      </div>
    </div>
  );
}
