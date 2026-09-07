'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MedicoDettante } from '@/lib/referti-medici';

// Drag & drop del dettato audio: il file entra nella coda di trascrizione e il
// Mac dello studio lo lavora. Stessa esperienza del pannello locale, ma da
// qualsiasi dispositivo dello studio, dentro ReferralFlow.
// Dal 2026-09-07 si sceglie anche CHI ha dettato (profili pubblicati dal Mac):
// la catena si adegua al medico — rallentamento dell'audio, vocabolario e
// dizionario suoi, modalità «lettera nuova» o «aggiornamento della lettera
// precedente». La scelta è obbligatoria quando i profili ci sono.

const ESTENSIONI = ['.mp3', '.m4a', '.mp4', '.wav', '.aac', '.ogg', '.flac', '.aiff', '.caf'];
const CHIAVE_MEMORIA = 'referti-medico';

export function UploadDettato({ tipo = 'referto', medici = [] }: { tipo?: 'referto' | 'visita'; medici?: MedicoDettante[] } = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [stato, setStato] = useState<'fermo' | 'invio' | 'ok' | 'errore'>('fermo');
  const [dettaglio, setDettaglio] = useState('');
  const [medico, setMedico] = useState('');

  // L'ultimo medico scelto resta memorizzato su questo dispositivo (solo l'id).
  useEffect(() => {
    try {
      const m = localStorage.getItem(CHIAVE_MEMORIA);
      if (m && medici.some((x) => x.id === m)) setMedico(m);
    } catch { /* memoria assente: si sceglie a mano */ }
  }, [medici]);

  function scegli(id: string) {
    setMedico(id);
    try { localStorage.setItem(CHIAVE_MEMORIA, id); } catch { /* niente memoria */ }
    if (stato === 'errore') setStato('fermo');
  }

  const serveMedico = medici.length > 0;
  const scelto = medici.find((m) => m.id === medico) ?? null;

  async function invia(files: FileList | File[]) {
    if (serveMedico && !scelto) {
      setStato('errore');
      setDettaglio('Prima scegli chi ha dettato: la catena si adegua al medico.');
      return;
    }
    const lista = Array.from(files).filter((f) =>
      ESTENSIONI.some((e) => f.name.toLowerCase().endsWith(e))
    );
    if (lista.length === 0) {
      setStato('errore');
      setDettaglio('Formato non riconosciuto: trascina un file audio (m4a, mp3, wav…).');
      return;
    }
    setStato('invio');
    setDettaglio(lista.length === 1 ? lista[0].name : `${lista.length} file`);
    try {
      for (const f of lista) {
        const fd = new FormData();
        fd.append('audio', f);
        fd.append('tipo', tipo);
        if (scelto) fd.append('medico', scelto.id);
        const r = await fetch('/api/referti/upload', { method: 'POST', body: fd });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.errore ?? `errore ${r.status}`);
        }
      }
      setStato('ok');
      setDettaglio(
        (lista.length === 1 ? lista[0].name : `${lista.length} dettati caricati`)
        + (scelto ? ` · ${scelto.breve}` : '')
      );
      router.refresh();
    } catch (e: any) {
      setStato('errore');
      setDettaglio(
        e?.message === 'file_troppo_grande'
          ? 'File troppo grande (massimo 200 MB).'
          : e?.message === 'medico_mancante'
            ? 'Scegli chi ha dettato tra i medici dello studio.'
            : 'Caricamento non riuscito: riprova.'
      );
    }
  }

  return (
    <div className="dz-blocco">
      {serveMedico && (
        <div className="dz-medici" role="radiogroup" aria-label="Chi ha dettato">
          <span className="dz-medici-label">Chi ha dettato?</span>
          {medici.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`qf-btn${medico === m.id ? ' active' : ''}`}
              aria-pressed={medico === m.id}
              onClick={() => scegli(m.id)}
              title={m.modalita === 'aggiornamento'
                ? 'Detta gli aggiornamenti alla lettera precedente: la fusione viene chiesta da sola'
                : 'Detta una lettera nuova'}
            >
              {m.breve}
            </button>
          ))}
          {scelto && (
            <span className="muted small">
              {scelto.modalita === 'aggiornamento'
                ? 'aggiorna la lettera precedente · fusione automatica'
                : 'lettera nuova'}
            </span>
          )}
        </div>
      )}
      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void invia(e.dataTransfer.files); }}
        onClick={() => {
          if (serveMedico && !scelto) { void invia([]); return; }
          inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ESTENSIONI.join(',')}
          multiple
          // display:none inline: l'attributo hidden verrebbe scavalcato dalla
          // regola CSS dei moduli (display block sugli input) e il campo nativo
          // resterebbe visibile catturando i clic.
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) void invia(e.target.files); e.target.value = ''; }}
        />
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" /><path d="m7 8 5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
        <div className="dz-testo">
          <b>Trascina qui il dettato{scelto ? ` di ${scelto.breve}` : ''}</b>
          <span>oppure clicca per scegliere il file · la trascrizione parte da sola</span>
        </div>
        {stato === 'invio' && <span className="dz-stato">Carico {dettaglio}…</span>}
        {stato === 'ok' && <span className="dz-stato ok">✓ {dettaglio} — in coda di trascrizione</span>}
        {stato === 'errore' && <span className="dz-stato err">{dettaglio}</span>}
      </div>
    </div>
  );
}
