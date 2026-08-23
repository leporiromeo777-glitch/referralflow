'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Drag & drop del dettato audio: il file entra nella coda di trascrizione e il
// Mac dello studio lo lavora. Stessa esperienza del pannello locale, ma da
// qualsiasi dispositivo dello studio, dentro ReferralFlow.

const ESTENSIONI = ['.mp3', '.m4a', '.mp4', '.wav', '.aac', '.ogg', '.flac', '.aiff', '.caf'];

export function UploadDettato({ tipo = 'referto' }: { tipo?: 'referto' | 'visita' } = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [stato, setStato] = useState<'fermo' | 'invio' | 'ok' | 'errore'>('fermo');
  const [dettaglio, setDettaglio] = useState('');

  async function invia(files: FileList | File[]) {
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
        const r = await fetch('/api/referti/upload', { method: 'POST', body: fd });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.errore ?? `errore ${r.status}`);
        }
      }
      setStato('ok');
      setDettaglio(lista.length === 1 ? lista[0].name : `${lista.length} dettati caricati`);
      router.refresh();
    } catch (e: any) {
      setStato('errore');
      setDettaglio(
        e?.message === 'file_troppo_grande'
          ? 'File troppo grande (massimo 200 MB).'
          : 'Caricamento non riuscito: riprova.'
      );
    }
  }

  return (
    <div
      className={`dropzone${drag ? ' drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void invia(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
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
        <b>Trascina qui il dettato</b>
        <span>oppure clicca per scegliere il file · la trascrizione parte da sola</span>
      </div>
      {stato === 'invio' && <span className="dz-stato">Carico {dettaglio}…</span>}
      {stato === 'ok' && <span className="dz-stato ok">✓ {dettaglio} — in coda di trascrizione</span>}
      {stato === 'errore' && <span className="dz-stato err">{dettaglio}</span>}
    </div>
  );
}
